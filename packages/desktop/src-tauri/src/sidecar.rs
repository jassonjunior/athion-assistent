//! Sidecar Manager — spawns and manages the Bun core process.
//!
//! Communication via JSON-RPC 2.0 over stdin/stdout.
//! Same protocol as the VS Code extension CoreBridge.

use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::{oneshot, Mutex};

/// Sidecar state managed by Tauri
pub struct SidecarState {
    inner: Arc<Mutex<Option<SidecarInner>>>,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>,
    next_id: Arc<AtomicU64>,
    stdin: Arc<Mutex<Option<tokio::process::ChildStdin>>>,
}

struct SidecarInner {
    child: Child,
}

impl SidecarState {
    fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(None)),
            pending: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(AtomicU64::new(1)),
            stdin: Arc::new(Mutex::new(None)),
        }
    }

    /// Send a JSON-RPC request and wait for response
    pub async fn request(
        &self,
        method: &str,
        params: Option<Value>,
    ) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);

        let request = serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params.unwrap_or(Value::Null)
        });

        let (tx, rx) = oneshot::channel();
        self.pending.lock().await.insert(id, tx);

        let msg = format!("{}\n", request);
        let mut stdin_guard = self.stdin.lock().await;
        let stdin = stdin_guard
            .as_mut()
            .ok_or("Sidecar not running")?;
        stdin
            .write_all(msg.as_bytes())
            .await
            .map_err(|e| format!("stdin write error: {e}"))?;
        stdin
            .flush()
            .await
            .map_err(|e| format!("stdin flush error: {e}"))?;
        drop(stdin_guard);

        let response = rx
            .await
            .map_err(|_| "Sidecar response channel closed")?;

        if let Some(error) = response.get("error") {
            return Err(error
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown error")
                .to_string());
        }

        Ok(response
            .get("result")
            .cloned()
            .unwrap_or(Value::Null))
    }

    pub async fn is_running(&self) -> bool {
        self.inner.lock().await.is_some()
    }
}

/// Start the sidecar and register state with Tauri
pub async fn start(app: &AppHandle) -> Result<(), String> {
    let bun_path = find_bun().map_err(|e| format!("bun not found: {e}"))?;
    let cli_path = find_cli_path(app);

    let mut child = Command::new(&bun_path)
        .arg(&cli_path)
        .arg("serve")
        .arg("--mode=stdio")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("spawn error: {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture stdout")?;
    let stdin = child
        .stdin
        .take()
        .ok_or("Failed to capture stdin")?;

    let state = SidecarState::new();
    *state.inner.lock().await = Some(SidecarInner { child });
    *state.stdin.lock().await = Some(stdin);

    // Spawn stdout reader task
    let pending = state.pending.clone();
    let handle = app.clone();
    spawn_reader(stdout, pending, handle);

    // Stderr logger
    if let Some(stderr) = state
        .inner
        .lock()
        .await
        .as_mut()
        .and_then(|s| s.child.stderr.take())
    {
        spawn_stderr_logger(stderr);
    }

    app.manage(state);

    log::info!("Sidecar started: {} {}", bun_path, cli_path);
    Ok(())
}

/// Read stdout lines, dispatch responses and notifications
fn spawn_reader(
    stdout: tokio::process::ChildStdout,
    pending: Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>,
    app: AppHandle,
) {
    tauri::async_runtime::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            let msg: Value = match serde_json::from_str(&line) {
                Ok(v) => v,
                Err(_) => continue,
            };

            if is_response(&msg) {
                handle_response(&msg, &pending).await;
            } else if is_notification(&msg) {
                handle_notification(&msg, &app);
            }
        }

        log::info!("Sidecar stdout reader ended");
    });
}

async fn handle_response(
    msg: &Value,
    pending: &Arc<Mutex<HashMap<u64, oneshot::Sender<Value>>>>,
) {
    if let Some(id) = msg.get("id").and_then(|v| v.as_u64()) {
        if let Some(tx) = pending.lock().await.remove(&id) {
            let _ = tx.send(msg.clone());
        }
    }
}

fn handle_notification(msg: &Value, app: &AppHandle) {
    let method = msg
        .get("method")
        .and_then(|m| m.as_str())
        .unwrap_or("");
    let params = msg
        .get("params")
        .cloned()
        .unwrap_or(Value::Null);

    if method == "chat.event" {
        let _ = app.emit("chat:event", params);
    }
}

fn is_response(msg: &Value) -> bool {
    msg.get("id").is_some() && msg.get("method").is_none()
}

fn is_notification(msg: &Value) -> bool {
    msg.get("method").is_some() && msg.get("id").is_none()
}

/// Log stderr output from sidecar
fn spawn_stderr_logger(stderr: tokio::process::ChildStderr) {
    tauri::async_runtime::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            log::debug!("[sidecar] {}", line);
        }
    });
}

/// Find bun binary in PATH or known locations
fn find_bun() -> Result<String, String> {
    // Try PATH first
    if let Ok(output) = std::process::Command::new("which")
        .arg("bun")
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout)
                .trim()
                .to_string();
            if !path.is_empty() {
                return Ok(path);
            }
        }
    }

    // Known locations
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("{home}/.bun/bin/bun"),
        "/usr/local/bin/bun".to_string(),
        "/opt/homebrew/bin/bun".to_string(),
    ];

    for candidate in &candidates {
        if std::path::Path::new(candidate).exists() {
            return Ok(candidate.clone());
        }
    }

    Err("bun binary not found".to_string())
}

/// Find the CLI entry point relative to the app
fn find_cli_path(app: &AppHandle) -> String {
    // In dev: use workspace path
    let resource = app
        .path()
        .resource_dir()
        .unwrap_or_default();

    // Try workspace-relative path first (dev mode)
    let dev_path = std::env::current_dir()
        .unwrap_or_default()
        .join("packages/cli/src/index.ts");

    if dev_path.exists() {
        return dev_path.to_string_lossy().to_string();
    }

    // Fallback: bundled resource
    resource
        .join("cli/index.ts")
        .to_string_lossy()
        .to_string()
}
