/**
 * Tipos compartilhados do CLI.
 * Representam o estado interno que hooks e componentes usam.
 * São derivados dos OrchestratorEvent do core, mas simplificados para a UI.
 */

/** Mensagem no histórico do chat. */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  toolCalls?: ToolCallInfo[]
  subagent?: SubAgentInfo
}

/** Informação sobre uma tool call em andamento ou concluída. */
export interface ToolCallInfo {
  id: string
  name: string
  args: unknown
  status: 'pending' | 'running' | 'success' | 'error'
  result?: string | undefined
}

/** Informação sobre um subagente em andamento ou concluído. */
export interface SubAgentInfo {
  name: string
  status: 'running' | 'completed' | 'failed'
  continuations: number
}

/** Definição de cores de um tema. */
export interface Theme {
  name: string
  primary: string
  secondary: string
  accent: string
  error: string
  success: string
  warning: string
  muted: string
}

/** Token usage do modelo. */
export interface TokenInfo {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}
