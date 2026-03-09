export const VERSION = '0.0.1'

// i18n
export { t, initI18n, getLocale, interpolate } from './i18n/i18n.js'
export type { SupportedLocale } from './i18n/i18n.js'

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
