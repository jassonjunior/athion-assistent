import type { TokenUsage } from '../provider/types'
import type { ToolDefinition, ToolResult } from '../tools/types'

/** Attachment
 * Descrição: Anexo de uma mensagem (arquivo ou imagem).
 */
export interface Attachment {
  /** type
   * Descrição: Tipo do anexo — 'file' para arquivos, 'image' para imagens
   */
  type: 'file' | 'image'
  /** path
   * Descrição: Caminho do anexo no sistema de arquivos
   */
  path: string
}

/** UserMessage
 * Descrição: Mensagem enviada pelo usuário ao Orchestrator.
 */
export interface UserMessage {
  /** content
   * Descrição: Conteúdo textual da mensagem do usuário
   */
  content: string
  /** attachments
   * Descrição: Lista de anexos (arquivos ou imagens) associados à mensagem
   */
  attachments?: Attachment[]
  /** onPermissionRequest
   * Descrição: Callback chamado quando uma tool requer aprovação do usuário (decision='ask').
   * O retorno define se a execução prossegue ('allow') ou é bloqueada ('deny').
   * Se não fornecido, tools com 'ask' retornam erro de permissão negada.
   * @param toolName - Nome da tool que solicita permissão
   * @param target - Alvo da operação (path, comando, etc.)
   * @returns Promise com 'allow' ou 'deny'
   */
  onPermissionRequest?: (toolName: string, target: string) => Promise<'allow' | 'deny'>
}

/** OrchestratorEvent
 * Descrição: Evento emitido pelo Orchestrator durante o streaming.
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
  | { type: 'permission_request'; requestId: string; toolName: string; target: string }
  | { type: 'finish'; usage: TokenUsage }
  | { type: 'error'; error: Error }
  | { type: 'model_loading'; modelName: string }
  | { type: 'model_ready'; modelName: string }

/** Session
 * Descrição: Sessão de conversa entre usuário e Orchestrator.
 */
export interface Session {
  /** id
   * Descrição: Identificador único da sessão
   */
  id: string
  /** projectId
   * Descrição: ID do projeto ao qual a sessão pertence
   */
  projectId: string
  /** title
   * Descrição: Título descritivo da sessão
   */
  title: string
  /** createdAt
   * Descrição: Data e hora de criação da sessão
   */
  createdAt: Date
  /** updatedAt
   * Descrição: Data e hora da última atualização da sessão
   */
  updatedAt: Date
}

/** AgentDefinition
 * Descrição: Definição de um subagente disponível.
 * Expandido na implementação do SubAgent Manager.
 */
export interface AgentDefinition {
  /** name
   * Descrição: Identificador único do agente (ex: 'code-reviewer')
   */
  name: string
  /** description
   * Descrição: Texto descritivo do que o agente faz
   */
  description: string
  /** skill
   * Descrição: Nome da skill que fornece o system prompt do agente
   */
  skill: string
  /** tools
   * Descrição: Whitelist de tools que o agente pode usar
   */
  tools: string[]
  /** maxTurns
   * Descrição: Limite de turnos para evitar loops infinitos (default: 50)
   */
  maxTurns?: number
}

/** Orchestrator
 * Descrição: Interface principal do Orchestrator.
 * Coordena chat streaming, sessions e delegação para tools/subagentes.
 */
export interface Orchestrator {
  /** chat
   * Descrição: Inicia chat streaming com uma sessão existente
   * @param sessionId - ID da sessão
   * @param message - Mensagem do usuário
   * @returns AsyncGenerator que emite OrchestratorEvent
   */
  chat(sessionId: string, message: UserMessage): AsyncGenerator<OrchestratorEvent>
  /** createSession
   * Descrição: Cria nova sessão de conversa
   * @param projectId - ID do projeto
   * @param title - Título opcional da sessão
   * @returns Promise com a sessão criada
   */
  createSession(projectId: string, title?: string): Promise<Session>
  /** loadSession
   * Descrição: Carrega sessão existente pelo ID
   * @param sessionId - ID da sessão a carregar
   * @returns Promise com a sessão carregada
   */
  loadSession(sessionId: string): Promise<Session>
  /** listSessions
   * Descrição: Lista todas as sessões, opcionalmente filtradas por projectId
   * @param projectId - ID do projeto para filtrar (opcional)
   * @returns Array de sessões
   */
  listSessions(projectId?: string): Session[]
  /** deleteSession
   * Descrição: Deleta uma sessão pelo ID
   * @param sessionId - ID da sessão a deletar
   */
  deleteSession(sessionId: string): void
  /** getAvailableTools
   * Descrição: Lista tools disponíveis para o LLM
   * @returns Array de definições de tools
   */
  getAvailableTools(): ToolDefinition[]
  /** getAvailableAgents
   * Descrição: Lista subagentes disponíveis
   * @returns Array de definições de agentes
   */
  getAvailableAgents(): AgentDefinition[]
}
