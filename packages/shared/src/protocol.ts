/**
 * Protocolo JSON-RPC 2.0 para comunicação Client ↔ Core (via stdio).
 *
 * Usado tanto pela extensão VS Code quanto pelo app Desktop (Tauri).
 * O client spawna `bun serve --mode=stdio` como child/sidecar process.
 * Comunicação bidirecional via stdin/stdout com JSON delimitado por \n.
 */

// ─── JSON-RPC 2.0 Base Types ──────────────────────────────────────

export interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

export interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: JsonRpcError
}

export interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

export interface JsonRpcError {
  code: number
  message: string
  data?: unknown
}

// ─── JSON-RPC Error Codes ──────────────────────────────────────────

export const RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const

// ─── Method Definitions ────────────────────────────────────────────

/** Methods clients can call on the server */
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
  | 'ping'

// ─── Request Params ────────────────────────────────────────────────

export interface ChatSendParams {
  sessionId: string
  content: string
}

export interface ChatAbortParams {
  sessionId: string
}

export interface SessionCreateParams {
  projectId: string
  title?: string | undefined
}

export interface SessionLoadParams {
  sessionId: string
}

export interface SessionDeleteParams {
  sessionId: string
}

export interface ConfigGetParams {
  key: string
}

export interface ConfigSetParams {
  key: string
  value: unknown
}

export interface CompletionCompleteParams {
  prefix: string
  suffix: string
  language: string
  filePath: string
}

// ─── Notification Events (server → client) ─────────────────────────

/** Server pushes these during chat.send streaming */
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

// ─── Response Types ────────────────────────────────────────────────

export interface SessionInfo {
  id: string
  projectId: string
  title: string
  createdAt: string
}

export interface ToolInfo {
  name: string
  description: string
  level: string
}

export interface AgentInfo {
  name: string
  description: string
}

export interface CompletionResult {
  text: string
  finishReason: string
}

// ─── Type Guards ───────────────────────────────────────────────────

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification

export function isResponse(msg: JsonRpcMessage): msg is JsonRpcResponse {
  return 'id' in msg && !('method' in msg)
}

export function isNotification(msg: JsonRpcMessage): msg is JsonRpcNotification {
  return 'method' in msg && !('id' in msg)
}

export function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
  return 'method' in msg && 'id' in msg
}
