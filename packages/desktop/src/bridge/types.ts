/**
 * Re-export dos tipos do protocolo compartilhado + tipos do desktop.
 * Descrição: Centraliza os tipos utilizados pela bridge Tauri, re-exportando do pacote compartilhado
 * e definindo tipos específicos do desktop.
 */

/** ChatEventNotification
 * Descrição: Notificação de evento de chat recebida do sidecar
 */
/** SessionInfo
 * Descrição: Informações de uma sessão de chat
 */
/** ToolInfo
 * Descrição: Informações sobre uma ferramenta disponível
 */
/** AgentInfo
 * Descrição: Informações sobre um agente
 */
/** CompletionResult
 * Descrição: Resultado de uma conclusão do modelo
 */
export type {
  ChatEventNotification,
  SessionInfo,
  ToolInfo,
  AgentInfo,
  CompletionResult,
} from '@athion/shared'

/** SidecarStatus
 * Descrição: Representa os possíveis estados de conexão com o sidecar
 * - 'starting': o sidecar está sendo inicializado
 * - 'ready': o sidecar está pronto para uso
 * - 'error': ocorreu um erro de conexão
 * - 'stopped': o sidecar está parado/desconectado
 */
export type SidecarStatus = 'starting' | 'ready' | 'error' | 'stopped'
