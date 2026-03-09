export const VERSION = '0.0.1'

export { RPC_ERRORS, isResponse, isNotification, isRequest } from './protocol.js'

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
} from './protocol.js'
