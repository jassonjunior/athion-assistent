/**
 * Bridge React <-> Rust Tauri
 * Descrição: Camada de comunicação entre o frontend React e o backend Rust via invoke() e listen() do Tauri.
 * Equivalente ao useMessenger do VS Code, mas para Tauri IPC.
 * Cada função mapeia diretamente para um #[tauri::command].
 */

import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import type { ChatEventNotification, SessionInfo } from '@athion/shared'

// ─── Chat ────────────────────────────────────────────────────────

/** chatSend
 * Descrição: Envia uma mensagem de chat para o sidecar processar
 * @param sessionId - ID da sessão de chat
 * @param content - Conteúdo textual da mensagem
 * @returns Promise que resolve quando a mensagem é enviada
 */
export async function chatSend(sessionId: string, content: string): Promise<void> {
  await invoke('chat_send', { sessionId, content })
}

/** chatAbort
 * Descrição: Aborta a geração de resposta em andamento para uma sessão
 * @param sessionId - ID da sessão a ser abortada
 * @returns Promise que resolve quando o abort é confirmado
 */
export async function chatAbort(sessionId: string): Promise<void> {
  await invoke('chat_abort', { sessionId })
}

// ─── Sessions ────────────────────────────────────────────────────

/** sessionCreate
 * Descrição: Cria uma nova sessão de chat no sidecar
 * @param projectId - ID do projeto ao qual a sessão pertence
 * @param title - Título opcional para a sessão
 * @returns Promise com as informações da sessão criada
 */
export async function sessionCreate(projectId: string, title?: string): Promise<SessionInfo> {
  return invoke<SessionInfo>('session_create', { projectId, title })
}

/** sessionList
 * Descrição: Lista todas as sessões de chat, opcionalmente filtradas por projeto
 * @param projectId - ID opcional do projeto para filtrar sessões
 * @returns Promise com a lista de sessões
 */
export async function sessionList(projectId?: string): Promise<SessionInfo[]> {
  return invoke<SessionInfo[]>('session_list', { projectId })
}

/** sessionLoad
 * Descrição: Carrega as informações de uma sessão específica
 * @param sessionId - ID da sessão a ser carregada
 * @returns Promise com as informações da sessão
 */
export async function sessionLoad(sessionId: string): Promise<SessionInfo> {
  return invoke<SessionInfo>('session_load', { sessionId })
}

/** sessionDelete
 * Descrição: Remove uma sessão de chat do sidecar
 * @param sessionId - ID da sessão a ser removida
 * @returns Promise que resolve quando a sessão é removida
 */
export async function sessionDelete(sessionId: string): Promise<void> {
  await invoke('session_delete', { sessionId })
}

// ─── Config ──────────────────────────────────────────────────────

/** configGet
 * Descrição: Obtém o valor de uma configuração pelo nome da chave
 * @param key - Nome da chave de configuração
 * @returns Promise com objeto contendo a chave e seu valor
 */
export async function configGet(key: string): Promise<{ key: string; value: unknown }> {
  return invoke('config_get', { key })
}

/** configSet
 * Descrição: Define o valor de uma configuração
 * @param key - Nome da chave de configuração
 * @param value - Valor a ser definido
 * @returns Promise que resolve quando a configuração é salva
 */
export async function configSet(key: string, value: unknown): Promise<void> {
  await invoke('config_set', { key, value })
}

/** configList
 * Descrição: Lista todas as configurações disponíveis
 * @returns Promise com mapa de chave/valor de todas as configurações
 */
export async function configList(): Promise<Record<string, unknown>> {
  return invoke('config_list')
}

// ─── Plugin/Skills ───────────────────────────────────────────────

/** SkillSearchResult
 * Descrição: Resultado de busca de skill no registry de plugins
 */
export interface SkillSearchResult {
  /** Nome do pacote npm do plugin */
  packageName: string
  /** Nome do plugin/skill */
  pluginName: string
  /** Descrição do que o plugin faz */
  description: string
  /** Versão do plugin */
  version: string
  /** Autor do plugin (opcional) */
  author?: string
}

/** pluginSearch
 * Descrição: Busca skills disponíveis no registry de plugins
 * @param query - Termo de busca opcional para filtrar skills
 * @returns Promise com a lista de resultados encontrados
 */
export async function pluginSearch(query?: string): Promise<{ results: SkillSearchResult[] }> {
  return invoke('plugin_search', { query })
}

/** pluginInstall
 * Descrição: Instala um plugin/skill a partir do registry
 * @param name - Nome do plugin a ser instalado
 * @returns Promise com resultado da instalação (sucesso ou erro)
 */
export async function pluginInstall(name: string): Promise<{ success: boolean; error?: string }> {
  return invoke('plugin_install', { name })
}

/** SkillInfo
 * Descrição: Informações detalhadas sobre uma skill instalada
 */
export interface SkillInfo {
  /** Nome da skill */
  name: string
  /** Descrição do que a skill faz */
  description: string
  /** Lista de gatilhos que ativam a skill automaticamente */
  triggers: string[]
}

/** skillList
 * Descrição: Lista todas as skills instaladas localmente
 * @returns Promise com a lista de skills instaladas
 */
export async function skillList(): Promise<SkillInfo[]> {
  return invoke('skill_list')
}

/** skillSetActive
 * Descrição: Ativa uma skill específica para ser aplicada nas próximas mensagens
 * @param name - Nome da skill a ser ativada
 * @returns Promise que resolve quando a skill é ativada
 */
export async function skillSetActive(name: string): Promise<void> {
  await invoke('skill_set_active', { name })
}

/** skillClearActive
 * Descrição: Desativa a skill ativa, voltando ao modo automático
 * @returns Promise que resolve quando a skill é desativada
 */
export async function skillClearActive(): Promise<void> {
  await invoke('skill_clear_active')
}

/** filesList
 * Descrição: Lista arquivos do workspace com base em um prefixo para autocomplete
 * @param prefix - Prefixo para filtrar arquivos
 * @param cwd - Diretório de trabalho opcional
 * @returns Promise com a lista de caminhos de arquivos encontrados
 */
export async function filesList(prefix: string, cwd?: string): Promise<{ files: string[] }> {
  return invoke('files_list', { prefix, cwd })
}

// ─── Status ──────────────────────────────────────────────────────

/** ping
 * Descrição: Verifica se o sidecar está respondendo
 * @returns Promise com objeto indicando se o sidecar respondeu
 */
export async function ping(): Promise<{ pong: boolean }> {
  return invoke('ping')
}

/** sidecarStatus
 * Descrição: Verifica se o processo sidecar está em execução
 * @returns Promise com objeto indicando se o sidecar está rodando
 */
export async function sidecarStatus(): Promise<{ running: boolean }> {
  return invoke('sidecar_status')
}

// ─── Event Listeners ─────────────────────────────────────────────

/** onChatEvent
 * Descrição: Registra um listener para eventos de chat emitidos pelo sidecar
 * @param handler - Função callback que recebe o evento de chat
 * @returns Promise com a função para remover o listener
 */
export function onChatEvent(handler: (event: ChatEventNotification) => void): Promise<UnlistenFn> {
  return listen<ChatEventNotification>('chat:event', (e) => handler(e.payload))
}

/** onTrayNewChat
 * Descrição: Registra um listener para o evento de novo chat disparado pela system tray
 * @param handler - Função callback disparada ao clicar em "novo chat" na tray
 * @returns Promise com a função para remover o listener
 */
export function onTrayNewChat(handler: () => void): Promise<UnlistenFn> {
  return listen('tray:new-chat', () => handler())
}

// ─── Deep Link Listeners ──────────────────────────────────────────

/** onDeepLinkSession
 * Descrição: Registra listener para deep link de sessão (athion://chat?session=<id>)
 * @param handler - Callback que recebe o ID da sessão
 * @returns Promise com a função para remover o listener
 */
export function onDeepLinkSession(handler: (sessionId: string) => void): Promise<UnlistenFn> {
  return listen<string>('deep-link:session', (e) => handler(e.payload))
}

/** onDeepLinkMessage
 * Descrição: Registra listener para deep link de mensagem (athion://chat?message=<texto>)
 * @param handler - Callback que recebe o texto da mensagem
 * @returns Promise com a função para remover o listener
 */
export function onDeepLinkMessage(handler: (message: string) => void): Promise<UnlistenFn> {
  return listen<string>('deep-link:message', (e) => handler(e.payload))
}

/** onDeepLinkNew
 * Descrição: Registra listener para deep link de novo chat (athion://new)
 * @param handler - Callback disparado ao receber o deep link
 * @returns Promise com a função para remover o listener
 */
export function onDeepLinkNew(handler: () => void): Promise<UnlistenFn> {
  return listen('deep-link:new', () => handler())
}

/** onDeepLinkConfig
 * Descrição: Registra listener para deep link de configuração (athion://config?key=<k>&value=<v>)
 * @param handler - Callback que recebe a chave e o valor da configuração
 * @returns Promise com a função para remover o listener
 */
export function onDeepLinkConfig(
  handler: (key: string, value: string) => void,
): Promise<UnlistenFn> {
  return listen<{ key: string; value: string }>('deep-link:config', (e) =>
    handler(e.payload.key, e.payload.value),
  )
}
