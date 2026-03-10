/**
 * deep_link — Handler para URLs athion://*.
 *
 * Esquemas suportados:
 *   athion://chat?session=<id>          → abre sessão específica
 *   athion://chat?message=<texto>       → abre com mensagem pré-preenchida
 *   athion://new                        → cria nova sessão
 *   athion://config?key=<k>&value=<v>  → configura uma chave
 *
 * Ao ser processada, a URL emite um evento para o frontend React via app_handle.emit().
 */

use tauri::{AppHandle, Manager};
use url::Url;

/// Processa uma lista de URLs recebidas via deep link.
pub fn handle_urls(app: &AppHandle, urls: Vec<String>) {
    for raw in urls {
        match Url::parse(&raw) {
            Ok(url) => dispatch(app, &url),
            Err(e) => log::warn!("[deep_link] URL inválida '{}': {}", raw, e),
        }
    }
}

/// Despacha para o handler correto baseado no host/path da URL.
fn dispatch(app: &AppHandle, url: &Url) {
    let host = url.host_str().unwrap_or("");
    let path = url.path();

    match (host, path) {
        ("chat", _) => handle_chat(app, url),
        ("new", _) | ("new", "/") => handle_new_session(app),
        ("config", _) => handle_config(app, url),
        _ => log::warn!("[deep_link] Rota desconhecida: {}://{}{}", url.scheme(), host, path),
    }
}

/// athion://chat?session=<id> ou athion://chat?message=<texto>
fn handle_chat(app: &AppHandle, url: &Url) {
    let params: std::collections::HashMap<String, String> = url.query_pairs().into_owned().collect();

    if let Some(session_id) = params.get("session") {
        let _ = app.emit("deep-link:session", session_id.clone());
        log::info!("[deep_link] Abrir sessão: {}", session_id);
        focus_window(app);
    } else if let Some(message) = params.get("message") {
        let _ = app.emit("deep-link:message", message.clone());
        log::info!("[deep_link] Mensagem pré-preenchida: {} chars", message.len());
        focus_window(app);
    } else {
        // athion://chat sem parâmetros → foca a janela
        focus_window(app);
    }
}

/// athion://new → cria nova sessão
fn handle_new_session(app: &AppHandle) {
    let _ = app.emit("deep-link:new", ());
    log::info!("[deep_link] Nova sessão solicitada");
    focus_window(app);
}

/// athion://config?key=<k>&value=<v>
fn handle_config(app: &AppHandle, url: &Url) {
    let params: std::collections::HashMap<String, String> = url.query_pairs().into_owned().collect();

    let key = params.get("key").map(|s| s.as_str()).unwrap_or("");
    let value = params.get("value").map(|s| s.as_str()).unwrap_or("");

    if key.is_empty() {
        log::warn!("[deep_link] athion://config sem parâmetro 'key'");
        return;
    }

    let payload = serde_json::json!({ "key": key, "value": value });
    let _ = app.emit("deep-link:config", payload);
    log::info!("[deep_link] Config: {}={}", key, value);
}

/// Foca (ou mostra) a janela principal.
fn focus_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}
