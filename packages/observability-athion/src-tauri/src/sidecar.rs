use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

/// State that holds the sidecar child process handle
pub struct SidecarState(pub Arc<Mutex<Option<Child>>>);

impl Default for SidecarState {
    fn default() -> Self {
        Self(Arc::new(Mutex::new(None)))
    }
}

/// Starts the Bun sidecar server and waits for it to be healthy.
pub async fn start(handle: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let resource_dir = handle
        .path()
        .resource_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    // Resolve the server entry point relative to the app
    let server_entry = resource_dir.join("src/server/index.ts");
    let entry = if server_entry.exists() {
        server_entry
    } else {
        // In dev mode, resolve relative to package root
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        manifest_dir.join("../src/server/index.ts")
    };

    log::info!("Starting sidecar: bun {}", entry.display());

    let child = Command::new("bun")
        .arg(entry.to_str().unwrap_or("src/server/index.ts"))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;

    // Store child handle in state
    let state = handle.state::<SidecarState>();
    {
        let mut guard = state.0.lock().await;
        *guard = Some(child);
    }

    // Health check: poll server until ready (max 30 attempts, 500ms interval = 15s)
    let max_attempts = 30;
    let interval = Duration::from_millis(500);
    let health_url = "http://localhost:3457/api/tests";

    for attempt in 1..=max_attempts {
        tokio::time::sleep(interval).await;

        match reqwest::get(health_url).await {
            Ok(resp) if resp.status().is_success() => {
                log::info!("Sidecar healthy after {} attempts", attempt);
                return Ok(());
            }
            Ok(resp) => {
                log::debug!(
                    "Health check attempt {}/{}: status {}",
                    attempt,
                    max_attempts,
                    resp.status()
                );
            }
            Err(e) => {
                log::debug!(
                    "Health check attempt {}/{}: {}",
                    attempt,
                    max_attempts,
                    e
                );
            }
        }

        // Check if child is still alive
        let mut guard = state.0.lock().await;
        if let Some(ref mut child) = *guard {
            match child.try_wait() {
                Ok(Some(status)) => {
                    log::error!("Sidecar exited prematurely with status: {}", status);
                    *guard = None;
                    return Err(format!("Sidecar exited with status: {}", status).into());
                }
                Err(e) => {
                    log::error!("Error checking sidecar status: {}", e);
                }
                _ => {}
            }
        }
    }

    Err(format!(
        "Sidecar health check failed after {} attempts ({}s)",
        max_attempts,
        max_attempts as f64 * interval.as_secs_f64()
    )
    .into())
}

/// Gracefully shuts down the sidecar process.
pub async fn shutdown(state: &SidecarState) {
    let mut guard = state.0.lock().await;
    if let Some(mut child) = guard.take() {
        log::info!("Shutting down sidecar...");

        // Try graceful kill first
        if let Err(e) = child.kill().await {
            log::warn!("Failed to kill sidecar: {}", e);
        } else {
            log::info!("Sidecar shut down successfully");
        }
    }
}

use tauri::Manager;

impl SidecarState {
    /// Register window close handler to kill sidecar on app exit
    pub fn register_close_handler(app: &tauri::App) {
        let state = app.state::<SidecarState>().0.clone();

        if let Some(window) = app.get_webview_window("main") {
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::Destroyed = event {
                    let state_clone = state.clone();
                    tauri::async_runtime::spawn(async move {
                        let sidecar = SidecarState(state_clone);
                        shutdown(&sidecar).await;
                    });
                }
            });
        }
    }
}
