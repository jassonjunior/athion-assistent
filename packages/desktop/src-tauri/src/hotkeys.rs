//! Global hotkeys registration.

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Register global hotkeys for the desktop app.
pub fn setup(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let quick_chat: Shortcut = "CmdOrCtrl+Shift+A".parse()?;

    app.global_shortcut().on_shortcut(quick_chat, |app, _shortcut, event| {
        if event.state == ShortcutState::Pressed {
            toggle_quick_chat(app);
        }
    })?;

    Ok(())
}

fn toggle_quick_chat(app: &AppHandle) {
    // Emit event to frontend to show/hide quick chat
    let _ = app.emit("hotkey:quick-chat", ());

    // If main window exists, show and focus it
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
