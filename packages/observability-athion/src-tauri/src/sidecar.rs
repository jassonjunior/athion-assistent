use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

use tauri::Manager;

/// Max restart attempts within the restart window
const MAX_RESTARTS: u32 = 3;
/// Time window for counting restarts (60 seconds)
const RESTART_WINDOW: Duration = Duration::from_secs(60);
/// Delay before attempting restart
const RESTART_DELAY: Duration = Duration::from_secs(2);

/// State that holds the sidecar child process handle
pub struct SidecarState {
    pub child: Arc<Mutex<Option<Child>>>,
    pub is_shutting_down: Arc<AtomicBool>,
}

impl Default for SidecarState {
    fn default() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            is_shutting_down: Arc::new(AtomicBool::new(false)),
        }
    }
}

/// Resolves the server entry point path
fn resolve_entry(handle: &tauri::AppHandle) -> std::path::PathBuf {
    let resource_dir = handle
        .path()
        .resource_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));

    let server_entry = resource_dir.join("src/server/index.ts");
    if server_entry.exists() {
        server_entry
    } else {
        let manifest_dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        manifest_dir.join("../src/server/index.ts")
    }
}

/// Spawns the Bun sidecar process
async fn spawn_sidecar(entry: &std::path::Path) -> Result<Child, Box<dyn std::error::Error>> {
    let child = Command::new("bun")
        .arg(entry.to_str().unwrap_or("src/server/index.ts"))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;
    Ok(child)
}

/// Runs health check against the sidecar
async fn health_check() -> Result<(), String> {
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
                log::debug!("Health check {}/{}: status {}", attempt, max_attempts, resp.status());
            }
            Err(e) => {
                log::debug!("Health check {}/{}: {}", attempt, max_attempts, e);
            }
        }
    }

    Err(format!(
        "Health check failed after {} attempts ({}s)",
        max_attempts,
        max_attempts as f64 * interval.as_secs_f64()
    ))
}

/// Starts the sidecar and returns success/failure
pub async fn start(handle: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let entry = resolve_entry(handle);
    log::info!("Starting sidecar: bun {}", entry.display());

    let child = spawn_sidecar(&entry).await?;

    let state = handle.state::<SidecarState>();
    {
        let mut guard = state.child.lock().await;
        *guard = Some(child);
    }

    health_check().await.map_err(|e| e.into())
}

/// Starts the sidecar with auto-restart monitoring
pub async fn start_with_monitor(handle: &tauri::AppHandle) {
    let entry = resolve_entry(handle);
    let state = handle.state::<SidecarState>();
    let child_arc = state.child.clone();
    let shutting_down = state.is_shutting_down.clone();

    let mut restart_times: Vec<Instant> = Vec::new();

    loop {
        if shutting_down.load(Ordering::Relaxed) {
            break;
        }

        log::info!("Starting sidecar: bun {}", entry.display());

        match spawn_sidecar(&entry).await {
            Ok(child) => {
                {
                    let mut guard = child_arc.lock().await;
                    *guard = Some(child);
                }

                match health_check().await {
                    Ok(()) => {
                        log::info!("Sidecar started successfully");

                        // Wait for the process to exit
                        loop {
                            tokio::time::sleep(Duration::from_secs(1)).await;

                            if shutting_down.load(Ordering::Relaxed) {
                                return;
                            }

                            let mut guard = child_arc.lock().await;
                            if let Some(ref mut child) = *guard {
                                match child.try_wait() {
                                    Ok(Some(status)) => {
                                        log::warn!("Sidecar exited with status: {}", status);
                                        *guard = None;
                                        break;
                                    }
                                    Err(e) => {
                                        log::error!("Error checking sidecar: {}", e);
                                        *guard = None;
                                        break;
                                    }
                                    _ => {} // Still running
                                }
                            } else {
                                break;
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("Sidecar health check failed: {}", e);
                        let mut guard = child_arc.lock().await;
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill().await;
                        }
                    }
                }
            }
            Err(e) => {
                log::error!("Failed to spawn sidecar: {}", e);
            }
        }

        if shutting_down.load(Ordering::Relaxed) {
            break;
        }

        // Check restart rate limit
        let now = Instant::now();
        restart_times.retain(|t| now.duration_since(*t) < RESTART_WINDOW);
        restart_times.push(now);

        if restart_times.len() > MAX_RESTARTS as usize {
            log::error!(
                "Sidecar crashed {} times in {}s, giving up",
                MAX_RESTARTS,
                RESTART_WINDOW.as_secs()
            );
            // Emit event to frontend
            if let Some(window) = handle.get_webview_window("main") {
                let _ = window.emit("sidecar-crashed", "max-restarts-exceeded");
            }
            break;
        }

        log::info!("Restarting sidecar in {}s...", RESTART_DELAY.as_secs());
        tokio::time::sleep(RESTART_DELAY).await;
    }
}

/// Gracefully shuts down the sidecar process.
pub async fn shutdown(state: &SidecarState) {
    state.is_shutting_down.store(true, Ordering::Relaxed);

    let mut guard = state.child.lock().await;
    if let Some(mut child) = guard.take() {
        log::info!("Shutting down sidecar...");
        if let Err(e) = child.kill().await {
            log::warn!("Failed to kill sidecar: {}", e);
        } else {
            log::info!("Sidecar shut down successfully");
        }
    }
}

impl SidecarState {
    /// Register window close handler to kill sidecar on app exit
    pub fn register_close_handler(app: &tauri::App) {
        let child = app.state::<SidecarState>().child.clone();
        let shutting_down = app.state::<SidecarState>().is_shutting_down.clone();

        if let Some(window) = app.get_webview_window("main") {
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::Destroyed = event {
                    let child_clone = child.clone();
                    let shutting_down_clone = shutting_down.clone();
                    tauri::async_runtime::spawn(async move {
                        let state = SidecarState {
                            child: child_clone,
                            is_shutting_down: shutting_down_clone,
                        };
                        shutdown(&state).await;
                    });
                }
            });
        }
    }
}
