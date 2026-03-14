use tauri::Manager;

mod hotkeys;
mod sidecar;
mod tray;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(sidecar::SidecarState::default())
        .setup(|app| {
            // Set app icon for dev mode (macOS dock)
            if let Some(window) = app.get_webview_window("main") {
                let icon_bytes = include_bytes!("../icons/128x128@2x.png");
                if let Ok(icon) = tauri::image::Image::from_bytes(icon_bytes) {
                    let _ = window.set_icon(icon);
                }
            }

            let handle = app.handle().clone();

            // Start sidecar with auto-restart monitoring
            tauri::async_runtime::spawn(async move {
                sidecar::start_with_monitor(&handle).await;
            });

            // Register close handler for graceful sidecar shutdown
            sidecar::SidecarState::register_close_handler(app);

            // Register global hotkeys
            if let Err(e) = hotkeys::setup(app.handle()) {
                log::error!("Failed to register hotkeys: {}", e);
            }

            // Setup system tray
            tray::setup(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
