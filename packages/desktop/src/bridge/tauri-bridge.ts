/**
 * Bridge React ↔ Rust Tauri via invoke() + listen().
 *
 * Equivalente ao useMessenger do VS Code, mas para Tauri IPC.
 * Cada função mapeia diretamente para um #[tauri::command].
 */

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { ChatEventNotification, SessionInfo } from '@athion/shared'

// ─── Chat ────────────────────────────────────────────────────────

export async function chatSend(sessionId: string, content: string): Promise<void> {
  await invoke('chat_send', { sessionId, content })
}

export async function chatAbort(sessionId: string): Promise<void> {
  await invoke('chat_abort', { sessionId })
}

// ─── Sessions ────────────────────────────────────────────────────

export async function sessionCreate(projectId: string, title?: string): Promise<SessionInfo> {
  return invoke<SessionInfo>('session_create', { projectId, title })
}

export async function sessionList(projectId?: string): Promise<SessionInfo[]> {
  return invoke<SessionInfo[]>('session_list', { projectId })
}

export async function sessionLoad(sessionId: string): Promise<SessionInfo> {
  return invoke<SessionInfo>('session_load', { sessionId })
}

export async function sessionDelete(sessionId: string): Promise<void> {
  await invoke('session_delete', { sessionId })
}

// ─── Config ──────────────────────────────────────────────────────

export async function configGet(key: string): Promise<{ key: string; value: unknown }> {
  return invoke('config_get', { key })
}

export async function configSet(key: string, value: unknown): Promise<void> {
  await invoke('config_set', { key, value })
}

export async function configList(): Promise<Record<string, unknown>> {
  return invoke('config_list')
}

// ─── Status ──────────────────────────────────────────────────────

export async function ping(): Promise<{ pong: boolean }> {
  return invoke('ping')
}

export async function sidecarStatus(): Promise<{ running: boolean }> {
  return invoke('sidecar_status')
}

// ─── Event Listeners ─────────────────────────────────────────────

export function onChatEvent(handler: (event: ChatEventNotification) => void): Promise<UnlistenFn> {
  return listen<ChatEventNotification>('chat:event', (e) => handler(e.payload))
}

export function onTrayNewChat(handler: () => void): Promise<UnlistenFn> {
  return listen('tray:new-chat', () => handler())
}
