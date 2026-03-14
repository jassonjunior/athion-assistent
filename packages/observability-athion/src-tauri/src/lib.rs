use tauri::Manager;

mod sidecar;
mod tray;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(sidecar::SidecarState::default())
        .setup(|app| {
            // Set app icon for dev mode (macOS dock)
            if let Some(window) = app.get_webview_window("main") {
                let icon_bytes = include_bytes!("../icons/128x128@2x.png");
                if let Ok(icon) = tauri::image::Image::from_bytes(icon_bytes) {
                    let _ = window.set_icon(Some(icon));
                }
            }

            let handle = app.handle().clone();

            // Start sidecar (Bun server)
            tauri::async_runtime::spawn(async move {
                if let Err(e) = sidecar::start(&handle).await {
                    log::error!("Failed to start sidecar: {}", e);
                }
            });

            // Register close handler for graceful sidecar shutdown
            sidecar::SidecarState::register_close_handler(app);

            // Setup system tray
            tray::setup(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
