mod commands;
mod hotkeys;
mod sidecar;
mod tray;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            let handle = app.handle().clone();

            // Start sidecar (Bun core process)
            tauri::async_runtime::spawn(async move {
                if let Err(e) = sidecar::start(&handle).await {
                    log::error!("Failed to start sidecar: {}", e);
                }
            });

            // Setup system tray
            tray::setup(app)?;

            // Register global hotkeys
            let hotkey_handle = app.handle().clone();
            if let Err(e) = hotkeys::setup(&hotkey_handle) {
                log::error!("Failed to register hotkeys: {}", e);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ping,
            commands::chat_send,
            commands::chat_abort,
            commands::session_create,
            commands::session_list,
            commands::session_load,
            commands::session_delete,
            commands::config_get,
            commands::config_set,
            commands::config_list,
            commands::sidecar_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
