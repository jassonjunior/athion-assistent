/**
 * Protocolo WebSocket entre server e client do test-ui.
 * Tipos compartilhados para comunicação bidirecional.
 */

/** Info de um teste disponível */
export interface TestInfo {
  name: string
  agent: string
  description: string
}

/** Tracking de tokens por evento */
export interface TokenSnapshot {
  contextLimit: number
  estimatedInput: number
  estimatedOutput: number
  totalUsed: number
  percentUsed: number
}

/** Mensagens do server para o client */
export type WsServerMessage =
  // Controle de teste
  | { type: 'test:list'; tests: TestInfo[] }
  | { type: 'test:started'; testName: string; ts: number }
  | {
      type: 'test:finished'
      testName: string
      passed: boolean
      duration: number
      ts: number
    }

  // Setup
  | { type: 'setup:step'; step: string; detail: string; ts: number }
  | { type: 'setup:tools'; tools: string[]; ts: number }
  | { type: 'setup:agents'; agents: string[]; ts: number }

  // Orchestrator events
  | { type: 'orch:user_message'; content: string; tokens: TokenSnapshot; ts: number }
  | {
      type: 'orch:system_prompt'
      preview: string
      fullLength: number
      tokens: TokenSnapshot
      ts: number
    }
  | { type: 'orch:content'; content: string; tokens: TokenSnapshot; ts: number }
  | {
      type: 'orch:tool_call'
      id: string
      name: string
      args: unknown
      tokens: TokenSnapshot
      ts: number
    }
  | {
      type: 'orch:tool_result'
      id: string
      name: string
      success: boolean
      preview: string
      tokens: TokenSnapshot
      ts: number
    }
  | { type: 'orch:subagent_start'; agentName: string; tokens: TokenSnapshot; ts: number }
  | {
      type: 'orch:subagent_complete'
      agentName: string
      resultPreview: string
      tokens: TokenSnapshot
      ts: number
    }
  | {
      type: 'orch:finish'
      promptTokens: number
      completionTokens: number
      totalTokens: number
      tokens: TokenSnapshot
      ts: number
    }
  | { type: 'orch:error'; message: string; tokens: TokenSnapshot; ts: number }

  // SubAgent events (granulares — capturados via instrumentação)
  | {
      type: 'sub:start'
      agentName: string
      taskId: string
      description: string
      tokens: TokenSnapshot
      ts: number
    }
  | { type: 'sub:content'; content: string; tokens: TokenSnapshot; ts: number }
  | {
      type: 'sub:tool_call'
      toolName: string
      args: unknown
      tokens: TokenSnapshot
      ts: number
    }
  | {
      type: 'sub:tool_result'
      toolName: string
      success: boolean
      preview: string
      tokens: TokenSnapshot
      ts: number
    }
  | {
      type: 'sub:continuation'
      continuationIndex: number
      accumulatedCount: number
      tokens: TokenSnapshot
      ts: number
    }
  | {
      type: 'sub:complete'
      taskId: string
      resultPreview: string
      tokens: TokenSnapshot
      ts: number
    }
  | { type: 'sub:error'; message: string; tokens: TokenSnapshot; ts: number }

  // Codebase indexer events
  | { type: 'codebase:progress'; indexed: number; total: number; currentFile: string; ts: number }
  | {
      type: 'codebase:indexed'
      totalFiles: number
      totalChunks: number
      hasVectors: boolean
      ts: number
    }
  | {
      type: 'codebase:results'
      query: string
      results: Array<{
        file: string
        startLine: number
        endLine: number
        language: string
        symbolName?: string
        chunkType: string
        score: number
        source: string
      }>
      ts: number
    }
  | { type: 'codebase:error'; message: string; ts: number }

/** Mensagens do client para o server */
export type WsClientMessage =
  | { type: 'test:run'; testName: string }
  | { type: 'test:stop' }
  | { type: 'test:list' }
  | { type: 'codebase:index'; workspacePath?: string }
  | { type: 'codebase:search'; query: string; limit?: number }

/** Evento unificado do Flow Observer (modo live — vem direto do flow-ws) */
export interface FlowEventMessage {
  id: string
  type: string
  timestamp: number
  data: Record<string, unknown>
  parentId?: string
}

/** Tipo unificado: WsServerMessage (test mode) ou FlowEventMessage (live mode) */
export type AnyMessage = WsServerMessage | FlowEventMessage

/** Verifica se uma mensagem é FlowEventMessage (live mode) */
export function isFlowEvent(msg: unknown): msg is FlowEventMessage {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'id' in msg &&
    'timestamp' in msg &&
    'data' in msg &&
    !('tokens' in msg)
  )
}

/** Trunca texto para preview */
export function truncatePreview(text: string, maxLen = 200): string {
  if (text.length <= maxLen) return text
  return text.slice(0, maxLen) + '...'
}
