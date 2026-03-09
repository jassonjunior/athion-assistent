/**
 * Re-export do protocolo JSON-RPC 2.0 compartilhado.
 * Tipos e funções definidos em @athion/shared/protocol.
 */
export { RPC_ERRORS, isResponse, isNotification, isRequest } from '@athion/shared'

export type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcNotification,
  JsonRpcError,
  JsonRpcMessage,
  RpcMethod,
  ChatSendParams,
  ChatAbortParams,
  SessionCreateParams,
  SessionLoadParams,
  SessionDeleteParams,
  ConfigGetParams,
  ConfigSetParams,
  CompletionCompleteParams,
  ChatEventNotification,
  SessionInfo,
  ToolInfo,
  AgentInfo,
  CompletionResult,
} from '@athion/shared'
