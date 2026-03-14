/**
 * protocol
 * Descrição: Re-export do protocolo JSON-RPC 2.0 compartilhado.
 * Tipos e funções definidos em @athion/shared/protocol.
 * Centraliza as importações do protocolo para uso interno da extensão.
 */

/** RPC_ERRORS, isResponse, isNotification, isRequest - Constantes e funções de validação do protocolo JSON-RPC */
export { RPC_ERRORS, isResponse, isNotification, isRequest } from '@athion/shared'

/** Tipos do protocolo JSON-RPC 2.0 compartilhado entre extensão e core */
export type {
  /** JsonRpcRequest - Tipo de requisição JSON-RPC */
  JsonRpcRequest,
  /** JsonRpcResponse - Tipo de resposta JSON-RPC */
  JsonRpcResponse,
  /** JsonRpcNotification - Tipo de notificação JSON-RPC (sem id) */
  JsonRpcNotification,
  /** JsonRpcError - Tipo de erro JSON-RPC */
  JsonRpcError,
  /** JsonRpcMessage - União de todos os tipos de mensagem JSON-RPC */
  JsonRpcMessage,
  /** RpcMethod - Métodos RPC disponíveis */
  RpcMethod,
  /** ChatSendParams - Parâmetros para enviar mensagem no chat */
  ChatSendParams,
  /** ChatAbortParams - Parâmetros para abortar chat em andamento */
  ChatAbortParams,
  /** SessionCreateParams - Parâmetros para criar nova sessão */
  SessionCreateParams,
  /** SessionLoadParams - Parâmetros para carregar sessão existente */
  SessionLoadParams,
  /** SessionDeleteParams - Parâmetros para deletar sessão */
  SessionDeleteParams,
  /** ConfigGetParams - Parâmetros para obter configuração */
  ConfigGetParams,
  /** ConfigSetParams - Parâmetros para definir configuração */
  ConfigSetParams,
  /** CompletionCompleteParams - Parâmetros para requisição de autocomplete */
  CompletionCompleteParams,
  /** ChatEventNotification - Notificação de evento do chat (streaming) */
  ChatEventNotification,
  /** SessionInfo - Informações de uma sessão */
  SessionInfo,
  /** ToolInfo - Informações de uma ferramenta */
  ToolInfo,
  /** AgentInfo - Informações de um agente */
  AgentInfo,
  /** CompletionResult - Resultado de uma requisição de autocomplete */
  CompletionResult,
} from '@athion/shared'
