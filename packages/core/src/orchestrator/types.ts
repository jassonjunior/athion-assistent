import type { TokenUsage } from '../provider/types'
import type { ToolDefinition, ToolResult } from '../tools/types'

/**
 * Anexo de uma mensagem (arquivo ou imagem).
 */
export interface Attachment {
  type: 'file' | 'image'
  path: string
}

/**
 * Mensagem enviada pelo usuario ao Orchestrator.
 */
export interface UserMessage {
  content: string
  attachments?: Attachment[]
}

/**
 * Evento emitido pelo Orchestrator durante o streaming.
 * Discriminated union pelo campo `type` — permite switch/case type-safe.
 */
export type OrchestratorEvent =
  | { type: 'content'; content: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; result: ToolResult }
  | { type: 'subagent_start'; agentName: string }
  | { type: 'subagent_progress'; agentName: string; data: unknown }
  | { type: 'subagent_complete'; agentName: string; result: unknown }
  | { type: 'subagent_continuation'; agentName: string; continuationIndex: number }
  | { type: 'finish'; usage: TokenUsage }
  | { type: 'error'; error: Error }

/**
 * Sessao de conversa entre usuario e Orchestrator.
 */
export interface Session {
  id: string
  projectId: string
  title: string
  createdAt: Date
  updatedAt: Date
}

/**
 * Definicao de um subagente disponivel.
 * Expandido na implementacao do SubAgent Manager.
 */
export interface AgentDefinition {
  /** Identificador unico do agente (ex: 'code-reviewer') */
  name: string
  /** Descricao do que o agente faz */
  description: string
  /** Nome da skill que fornece o system prompt */
  skill: string
  /** Whitelist de tools que o agente pode usar */
  tools: string[]
  /** Limite de turnos para evitar loops infinitos (default: 50) */
  maxTurns?: number
}

/**
 * Interface principal do Orchestrator.
 * Coordena chat streaming, sessions e delegacao para tools/subagentes.
 */
export interface Orchestrator {
  /** Inicia chat streaming com uma sessao existente */
  chat(sessionId: string, message: UserMessage): AsyncGenerator<OrchestratorEvent>
  /** Cria nova sessao de conversa */
  createSession(projectId: string, title?: string): Promise<Session>
  /** Carrega sessao existente pelo ID */
  loadSession(sessionId: string): Promise<Session>
  /** Lista tools disponiveis para o LLM */
  getAvailableTools(): ToolDefinition[]
  /** Lista subagentes disponiveis */
  getAvailableAgents(): AgentDefinition[]
}
