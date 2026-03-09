/**
 * Re-export dos tipos do protocolo compartilhado + tipos do desktop.
 */

export type {
  ChatEventNotification,
  SessionInfo,
  ToolInfo,
  AgentInfo,
  CompletionResult,
} from '@athion/shared'

export type SidecarStatus = 'starting' | 'ready' | 'error' | 'stopped'
