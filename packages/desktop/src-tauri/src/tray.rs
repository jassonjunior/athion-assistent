//! System tray setup with menu and click handlers.

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    App, Emitter, Manager,
};

pub fn setup(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let new_chat = MenuItem::with_id(app, "new_chat", "Nova Sessão", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Abrir Athion", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &new_chat, &separator, &quit])?;

    TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Athion Assistent")
        .on_menu_event(move |app, event| {
            handle_menu_event(app, event.id().as_ref());
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click { .. } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn handle_menu_event(app: &tauri::AppHandle, id: &str) {
    match id {
        "show" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        "new_chat" => {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = window.emit("tray:new-chat", ());
            }
        }
        "quit" => {
            app.exit(0);
        }
        _ => {}
    }
}
