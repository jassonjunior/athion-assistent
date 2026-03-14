use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

pub fn setup(handle: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    // macOS: Cmd+Shift+O, Windows/Linux: Ctrl+Shift+O
    let shortcut = if cfg!(target_os = "macos") {
        "Command+Shift+O"
    } else {
        "Control+Shift+O"
    };

    let shortcut: Shortcut = shortcut.parse()?;
    let app_handle = handle.clone();

    handle.plugin(
        tauri_plugin_global_shortcut::Builder::new()
            .with_handler(move |_app, _shortcut, event| {
                if event == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.unminimize();
                        let _ = window.set_focus();
                    }
                }
            })
            .build(),
    )?;

    handle.global_shortcut().register(shortcut)?;

    log::info!("Global hotkey registered: {}", if cfg!(target_os = "macos") { "Cmd+Shift+O" } else { "Ctrl+Shift+O" });

    Ok(())
}
