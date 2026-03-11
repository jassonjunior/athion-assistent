use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

mod commands;
mod deep_link;
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
            // Set app icon for dev mode (macOS dock)
            if let Some(window) = app.get_webview_window("main") {
                let icon_bytes = include_bytes!("../icons/128x128@2x.png");
                if let Ok(icon) = tauri::image::Image::from_bytes(icon_bytes) {
                    let _ = window.set_icon(Some(icon));
                }
            }

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

            // Register deep link handler (athion://)
            let deep_link_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls: Vec<String> = event.urls().into_iter().map(|u| u.to_string()).collect();
                deep_link::handle_urls(&deep_link_handle, urls);
            });

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
            commands::plugin_search,
            commands::plugin_install,
            commands::skill_set_active,
            commands::skill_clear_active,
            commands::skill_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
