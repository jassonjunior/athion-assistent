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

// ─── Plugin/Skills ───────────────────────────────────────────────

export interface SkillSearchResult {
  packageName: string
  pluginName: string
  description: string
  version: string
  author?: string
}

export async function pluginSearch(query?: string): Promise<{ results: SkillSearchResult[] }> {
  return invoke('plugin_search', { query })
}

export async function pluginInstall(name: string): Promise<{ success: boolean; error?: string }> {
  return invoke('plugin_install', { name })
}

export interface SkillInfo {
  name: string
  description: string
  triggers: string[]
}

export async function skillList(): Promise<SkillInfo[]> {
  return invoke('skill_list')
}

export async function skillSetActive(name: string): Promise<void> {
  await invoke('skill_set_active', { name })
}

export async function skillClearActive(): Promise<void> {
  await invoke('skill_clear_active')
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

// ─── Deep Link Listeners ──────────────────────────────────────────

/** athion://chat?session=<id> */
export function onDeepLinkSession(handler: (sessionId: string) => void): Promise<UnlistenFn> {
  return listen<string>('deep-link:session', (e) => handler(e.payload))
}

/** athion://chat?message=<texto> */
export function onDeepLinkMessage(handler: (message: string) => void): Promise<UnlistenFn> {
  return listen<string>('deep-link:message', (e) => handler(e.payload))
}

/** athion://new */
export function onDeepLinkNew(handler: () => void): Promise<UnlistenFn> {
  return listen('deep-link:new', () => handler())
}

/** athion://config?key=<k>&value=<v> */
export function onDeepLinkConfig(
  handler: (key: string, value: string) => void,
): Promise<UnlistenFn> {
  return listen<{ key: string; value: string }>('deep-link:config', (e) =>
    handler(e.payload.key, e.payload.value),
  )
}
