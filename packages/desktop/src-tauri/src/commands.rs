//! Tauri commands — thin proxy to the Bun sidecar via JSON-RPC.
//!
//! Each command simply forwards the call to SidecarState::request().

use crate::sidecar::SidecarState;
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub async fn ping(state: State<'_, SidecarState>) -> Result<Value, String> {
    state.request("ping", None).await
}

#[tauri::command]
pub async fn chat_send(
    state: State<'_, SidecarState>,
    session_id: String,
    content: String,
) -> Result<Value, String> {
    state
        .request("chat.send", Some(json!({ "sessionId": session_id, "content": content })))
        .await
}

#[tauri::command]
pub async fn chat_abort(
    state: State<'_, SidecarState>,
    session_id: String,
) -> Result<Value, String> {
    state
        .request("chat.abort", Some(json!({ "sessionId": session_id })))
        .await
}

#[tauri::command]
pub async fn session_create(
    state: State<'_, SidecarState>,
    project_id: String,
    title: Option<String>,
) -> Result<Value, String> {
    state
        .request("session.create", Some(json!({ "projectId": project_id, "title": title })))
        .await
}

#[tauri::command]
pub async fn session_list(
    state: State<'_, SidecarState>,
    project_id: Option<String>,
) -> Result<Value, String> {
    state
        .request("session.list", Some(json!({ "projectId": project_id })))
        .await
}

#[tauri::command]
pub async fn session_load(
    state: State<'_, SidecarState>,
    session_id: String,
) -> Result<Value, String> {
    state
        .request("session.load", Some(json!({ "sessionId": session_id })))
        .await
}

#[tauri::command]
pub async fn session_delete(
    state: State<'_, SidecarState>,
    session_id: String,
) -> Result<Value, String> {
    state
        .request("session.delete", Some(json!({ "sessionId": session_id })))
        .await
}

#[tauri::command]
pub async fn config_get(
    state: State<'_, SidecarState>,
    key: String,
) -> Result<Value, String> {
    state
        .request("config.get", Some(json!({ "key": key })))
        .await
}

#[tauri::command]
pub async fn config_set(
    state: State<'_, SidecarState>,
    key: String,
    value: Value,
) -> Result<Value, String> {
    state
        .request("config.set", Some(json!({ "key": key, "value": value })))
        .await
}

#[tauri::command]
pub async fn config_list(
    state: State<'_, SidecarState>,
) -> Result<Value, String> {
    state.request("config.list", None).await
}

#[tauri::command]
pub async fn sidecar_status(
    state: State<'_, SidecarState>,
) -> Result<Value, String> {
    let running = state.is_running().await;
    Ok(json!({ "running": running }))
}

#[tauri::command]
pub async fn skill_set_active(
    state: State<'_, SidecarState>,
    name: String,
) -> Result<Value, String> {
    state
        .request("skill.setActive", Some(json!({ "name": name })))
        .await
}

#[tauri::command]
pub async fn skill_clear_active(state: State<'_, SidecarState>) -> Result<Value, String> {
    state.request("skill.clearActive", None).await
}

#[tauri::command]
pub async fn skill_list(state: State<'_, SidecarState>) -> Result<Value, String> {
    state.request("skill.list", None).await
}

#[tauri::command]
pub async fn plugin_search(
    state: State<'_, SidecarState>,
    query: Option<String>,
) -> Result<Value, String> {
    state
        .request("plugin.search", Some(json!({ "query": query })))
        .await
}

#[tauri::command]
pub async fn plugin_install(
    state: State<'_, SidecarState>,
    name: String,
) -> Result<Value, String> {
    state
        .request("plugin.install", Some(json!({ "name": name })))
        .await
}
