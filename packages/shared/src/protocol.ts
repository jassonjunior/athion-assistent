/**
 * Protocolo JSON-RPC 2.0 para comunicação Client ↔ Core (via stdio).
 *
 * Usado tanto pela extensão VS Code quanto pelo app Desktop (Tauri).
 * O client spawna `bun serve --mode=stdio` como child/sidecar process.
 * Comunicação bidirecional via stdin/stdout com JSON delimitado por \n.
 */

// ─── JSON-RPC 2.0 Base Types ──────────────────────────────────────

/** JsonRpcRequest
 * Descrição: Representa uma requisição JSON-RPC 2.0 enviada do client para o server
 * @param jsonrpc - Versão do protocolo, sempre '2.0'
 * @param id - Identificador único da requisição
 * @param method - Nome do método a ser invocado
 * @param params - Parâmetros opcionais do método
 */
export interface JsonRpcRequest {
  /** Versão do protocolo JSON-RPC */
  jsonrpc: '2.0'
  /** Identificador único da requisição */
  id: number
  /** Nome do método RPC a ser chamado */
  method: string
  /** Parâmetros opcionais da requisição */
  params?: unknown
}

/** JsonRpcResponse
 * Descrição: Representa uma resposta JSON-RPC 2.0 retornada do server para o client
 * @param jsonrpc - Versão do protocolo, sempre '2.0'
 * @param id - Identificador da requisição correspondente
 * @param result - Resultado em caso de sucesso
 * @param error - Objeto de erro em caso de falha
 */
export interface JsonRpcResponse {
  /** Versão do protocolo JSON-RPC */
  jsonrpc: '2.0'
  /** Identificador da requisição correspondente */
  id: number
  /** Resultado da operação em caso de sucesso */
  result?: unknown
  /** Detalhes do erro em caso de falha */
  error?: JsonRpcError
}

/** JsonRpcNotification
 * Descrição: Representa uma notificação JSON-RPC 2.0 (sem id, não espera resposta)
 * @param jsonrpc - Versão do protocolo, sempre '2.0'
 * @param method - Nome do método da notificação
 * @param params - Parâmetros opcionais da notificação
 */
export interface JsonRpcNotification {
  /** Versão do protocolo JSON-RPC */
  jsonrpc: '2.0'
  /** Nome do método da notificação */
  method: string
  /** Parâmetros opcionais da notificação */
  params?: unknown
}

/** JsonRpcError
 * Descrição: Representa um erro no protocolo JSON-RPC 2.0
 * @param code - Código numérico do erro
 * @param message - Mensagem descritiva do erro
 * @param data - Dados adicionais opcionais sobre o erro
 */
export interface JsonRpcError {
  /** Código numérico do erro conforme especificação JSON-RPC */
  code: number
  /** Mensagem descritiva do erro */
  message: string
  /** Dados adicionais opcionais sobre o erro */
  data?: unknown
}

// ─── JSON-RPC Error Codes ──────────────────────────────────────────

/** RPC_ERRORS
 * Descrição: Códigos de erro padrão do protocolo JSON-RPC 2.0
 */
export const RPC_ERRORS = {
  /** Erro ao fazer parse do JSON recebido */
  PARSE_ERROR: -32700,
  /** Requisição JSON-RPC inválida */
  INVALID_REQUEST: -32600,
  /** Método solicitado não encontrado */
  METHOD_NOT_FOUND: -32601,
  /** Parâmetros inválidos para o método */
  INVALID_PARAMS: -32602,
  /** Erro interno do servidor */
  INTERNAL_ERROR: -32603,
} as const

// ─── Method Definitions ────────────────────────────────────────────

/** RpcMethod
 * Descrição: Union type com todos os métodos RPC disponíveis que os clients podem chamar no server
 */
export type RpcMethod =
  | 'chat.send'
  | 'chat.abort'
  | 'session.create'
  | 'session.list'
  | 'session.load'
  | 'session.delete'
  | 'config.get'
  | 'config.set'
  | 'config.list'
  | 'tools.list'
  | 'agents.list'
  | 'completion.complete'
  | 'codebase.index'
  | 'codebase.search'
  | 'codebase.status'
  | 'codebase.clear'
  | 'codebase.getDependencyGraph'
  | 'skill.list'
  | 'skill.setActive'
  | 'skill.clearActive'
  | 'files.list'
  | 'plugin.search'
  | 'plugin.install'
  | 'ping'

// ─── Request Params ────────────────────────────────────────────────

/** ChatSendParams
 * Descrição: Parâmetros para envio de mensagem no chat via método 'chat.send'
 * @param sessionId - Identificador da sessão de chat
 * @param content - Conteúdo da mensagem a ser enviada
 */
export interface ChatSendParams {
  /** Identificador da sessão de chat */
  sessionId: string
  /** Conteúdo da mensagem a ser enviada */
  content: string
}

/** ChatAbortParams
 * Descrição: Parâmetros para abortar uma operação de chat em andamento via método 'chat.abort'
 * @param sessionId - Identificador da sessão de chat a ser abortada
 */
export interface ChatAbortParams {
  /** Identificador da sessão de chat a ser abortada */
  sessionId: string
}

/** SessionCreateParams
 * Descrição: Parâmetros para criação de uma nova sessão via método 'session.create'
 * @param projectId - Identificador do projeto associado
 * @param title - Título opcional da sessão
 */
export interface SessionCreateParams {
  /** Identificador do projeto associado à sessão */
  projectId: string
  /** Título opcional da sessão */
  title?: string | undefined
}

/** SessionLoadParams
 * Descrição: Parâmetros para carregar uma sessão existente via método 'session.load'
 * @param sessionId - Identificador da sessão a ser carregada
 */
export interface SessionLoadParams {
  /** Identificador da sessão a ser carregada */
  sessionId: string
}

/** SessionDeleteParams
 * Descrição: Parâmetros para deletar uma sessão via método 'session.delete'
 * @param sessionId - Identificador da sessão a ser deletada
 */
export interface SessionDeleteParams {
  /** Identificador da sessão a ser deletada */
  sessionId: string
}

/** ConfigGetParams
 * Descrição: Parâmetros para obter um valor de configuração via método 'config.get'
 * @param key - Chave da configuração a ser obtida
 */
export interface ConfigGetParams {
  /** Chave da configuração a ser obtida */
  key: string
}

/** ConfigSetParams
 * Descrição: Parâmetros para definir um valor de configuração via método 'config.set'
 * @param key - Chave da configuração a ser definida
 * @param value - Valor a ser atribuído à configuração
 */
export interface ConfigSetParams {
  /** Chave da configuração a ser definida */
  key: string
  /** Valor a ser atribuído à configuração */
  value: unknown
}

/** CompletionCompleteParams
 * Descrição: Parâmetros para solicitar autocompletar de código via método 'completion.complete'
 * @param prefix - Texto antes do cursor
 * @param suffix - Texto depois do cursor
 * @param language - Linguagem de programação do arquivo
 * @param filePath - Caminho do arquivo sendo editado
 */
export interface CompletionCompleteParams {
  /** Texto antes da posição do cursor */
  prefix: string
  /** Texto depois da posição do cursor */
  suffix: string
  /** Linguagem de programação do arquivo */
  language: string
  /** Caminho do arquivo sendo editado */
  filePath: string
}

// ─── Notification Events (server → client) ─────────────────────────

/** ChatEventNotification
 * Descrição: Union type de eventos de notificação que o server envia ao client durante streaming do chat
 * Eventos possíveis: content, tool_call, tool_result, subagent_start, subagent_progress,
 * subagent_complete, subagent_continuation, finish, error, model_loading, model_ready
 */
export type ChatEventNotification =
  | { type: 'content'; content: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; name: string; success: boolean; preview: string }
  | { type: 'subagent_start'; agentName: string }
  | { type: 'subagent_progress'; agentName: string; data: unknown }
  | { type: 'subagent_complete'; agentName: string; result: unknown }
  | { type: 'subagent_continuation'; agentName: string; continuationIndex: number }
  | { type: 'finish'; promptTokens: number; completionTokens: number }
  | { type: 'error'; message: string }
  | { type: 'model_loading'; modelName: string }
  | { type: 'model_ready'; modelName: string }

// ─── Response Types ────────────────────────────────────────────────

/** SessionInfo
 * Descrição: Informações de uma sessão de chat retornadas pelo server
 * @param id - Identificador único da sessão
 * @param projectId - Identificador do projeto associado
 * @param title - Título da sessão
 * @param createdAt - Data de criação da sessão em formato ISO 8601
 */
export interface SessionInfo {
  /** Identificador único da sessão */
  id: string
  /** Identificador do projeto associado à sessão */
  projectId: string
  /** Título da sessão */
  title: string
  /** Data de criação da sessão em formato ISO 8601 */
  createdAt: string
}

/** ToolInfo
 * Descrição: Informações sobre uma ferramenta (tool) disponível no sistema
 * @param name - Nome identificador da ferramenta
 * @param description - Descrição do que a ferramenta faz
 * @param level - Nível de acesso ou categoria da ferramenta
 */
export interface ToolInfo {
  /** Nome identificador da ferramenta */
  name: string
  /** Descrição do que a ferramenta faz */
  description: string
  /** Nível de acesso ou categoria da ferramenta */
  level: string
}

/** AgentInfo
 * Descrição: Informações sobre um agente (sub-agente) disponível no sistema
 * @param name - Nome identificador do agente
 * @param description - Descrição do que o agente faz
 */
export interface AgentInfo {
  /** Nome identificador do agente */
  name: string
  /** Descrição do que o agente faz */
  description: string
}

/** CompletionResult
 * Descrição: Resultado de uma solicitação de autocompletar de código
 * @param text - Texto sugerido para autocompletar
 * @param finishReason - Motivo pelo qual a geração foi finalizada
 */
export interface CompletionResult {
  /** Texto sugerido para autocompletar */
  text: string
  /** Motivo pelo qual a geração foi finalizada (ex: 'stop', 'length') */
  finishReason: string
}

// ─── Type Guards ───────────────────────────────────────────────────

/** JsonRpcMessage
 * Descrição: Union type que representa qualquer mensagem JSON-RPC 2.0 (requisição, resposta ou notificação)
 */
export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification

/** isResponse
 * Descrição: Type guard que verifica se uma mensagem JSON-RPC é uma resposta
 * @param msg - Mensagem JSON-RPC a ser verificada
 * @returns Verdadeiro se a mensagem for uma JsonRpcResponse
 */
export function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return 'id' in msg && !('method' in msg)
}

/** isNotification
 * Descrição: Type guard que verifica se uma mensagem JSON-RPC é uma notificação
 * @param msg - Mensagem JSON-RPC a ser verificada
 * @returns Verdadeiro se a mensagem for uma JsonRpcNotification
 */
export function isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return 'method' in msg && !('id' in msg)
}

/** isRequest
 * Descrição: Type guard que verifica se uma mensagem JSON-RPC é uma requisição
 * @param msg - Mensagem JSON-RPC a ser verificada
 * @returns Verdadeiro se a mensagem for uma JsonRpcRequest
 */
export function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return 'method' in msg && 'id' in msg
}
