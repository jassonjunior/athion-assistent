/**
 * StdioServer — JSON-RPC 2.0 server over stdin/stdout.
 * Descrição: Servidor que lê requisições JSON-RPC de stdin e envia respostas/notificações via stdout.
 *
 * Lê linhas JSON de stdin, despacha para handlers, escreve responses em stdout.
 * Notifications (server → client) são escritas em stdout sem ID.
 *
 * Usado pela extensão VS Code que spawna este processo como child.
 * Logs vão para stderr (não interferem com o protocolo).
 */

import type { AthionCore } from '@athion/core'
import { createHandlers, type RpcHandlers } from './handlers.js'

/** JsonRpcRequest
 * Descrição: Estrutura de uma requisição JSON-RPC 2.0 recebida pelo servidor.
 */
interface JsonRpcRequest {
  /** Versão do protocolo JSON-RPC (sempre '2.0') */
  jsonrpc: '2.0'
  /** Identificador numérico da requisição para correlação com a resposta */
  id: number
  /** Nome do método RPC a ser executado */
  method: string
  /** Parâmetros opcionais da requisição */
  params?: unknown
}

/** JsonRpcResponse
 * Descrição: Estrutura de uma resposta JSON-RPC 2.0 enviada pelo servidor.
 */
interface JsonRpcResponse {
  /** Versão do protocolo JSON-RPC (sempre '2.0') */
  jsonrpc: '2.0'
  /** Identificador da requisição que originou esta resposta */
  id: number
  /** Resultado da execução do método, se bem-sucedido */
  result?: unknown
  /** Informações de erro, se a execução falhou */
  error?: { code: number; message: string; data?: unknown }
}

/** JsonRpcNotification
 * Descrição: Estrutura de uma notificação JSON-RPC 2.0 (sem ID, server → client).
 */
interface JsonRpcNotification {
  /** Versão do protocolo JSON-RPC (sempre '2.0') */
  jsonrpc: '2.0'
  /** Nome do método de notificação */
  method: string
  /** Parâmetros opcionais da notificação */
  params?: unknown
}

/** RPC_ERRORS
 * Descrição: Códigos de erro padrão do protocolo JSON-RPC 2.0.
 */
const RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INTERNAL_ERROR: -32603,
} as const

/** createStdioServer
 * Descrição: Cria uma instância do servidor JSON-RPC 2.0 sobre stdin/stdout.
 * @param core - Instância do core do Athion para processamento das requisições
 * @returns Objeto com métodos start (para iniciar o servidor) e sendNotification (para enviar notificações)
 */
export function createStdioServer(core: AthionCore) {
  const handlers = createHandlers(core, sendNotification)
  let buffer = ''

  /** sendNotification
   * Descrição: Envia uma notificação JSON-RPC para o cliente via stdout.
   * @param method - Nome do método da notificação
   * @param params - Parâmetros opcionais da notificação
   */
  function sendNotification(method: string, params?: unknown): void {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {}),
    }
    process.stdout.write(JSON.stringify(notification) + '\n')
  }

  /** sendResponse
   * Descrição: Envia uma resposta JSON-RPC para o cliente via stdout.
   * @param response - Objeto de resposta JSON-RPC a ser serializado e enviado
   */
  function sendResponse(response: JsonRpcResponse): void {
    process.stdout.write(JSON.stringify(response) + '\n')
  }

  /** sendError
   * Descrição: Envia uma resposta de erro JSON-RPC para o cliente.
   * @param id - ID da requisição que causou o erro
   * @param code - Código de erro JSON-RPC
   * @param message - Mensagem descritiva do erro
   */
  function sendError(id: number, code: number, message: string): void {
    sendResponse({ jsonrpc: '2.0', id, error: { code, message } })
  }

  /** dispatch
   * Descrição: Despacha uma requisição JSON-RPC para o handler correspondente.
   * @param request - Requisição JSON-RPC a ser processada
   * @returns Promise que resolve quando o handler termina de processar
   */
  async function dispatch(request: JsonRpcRequest): Promise<void> {
    const handler = handlers[request.method as keyof RpcHandlers]

    if (!handler) {
      sendError(request.id, RPC_ERRORS.METHOD_NOT_FOUND, `Method not found: ${request.method}`)
      return
    }

    try {
      const result = await handler(request.params)
      sendResponse({ jsonrpc: '2.0', id: request.id, result: result ?? null })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendError(request.id, RPC_ERRORS.INTERNAL_ERROR, message)
    }
  }

  /** handleData
   * Descrição: Processa chunks de dados recebidos do stdin, parseando linhas JSON-RPC.
   * @param chunk - Fragmento de texto recebido do stdin
   */
  function handleData(chunk: string): void {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const msg = JSON.parse(trimmed) as JsonRpcRequest
        if (msg.jsonrpc !== '2.0' || typeof msg.id !== 'number' || typeof msg.method !== 'string') {
          sendError(msg.id ?? 0, RPC_ERRORS.INVALID_REQUEST, 'Invalid JSON-RPC request')
          continue
        }
        dispatch(msg).catch((err) => {
          log(`Dispatch error: ${err}`)
        })
      } catch {
        // Can't respond without ID
        log(`Parse error: ${trimmed.slice(0, 100)}`)
      }
    }
  }

  /** log
   * Descrição: Escreve mensagem de log no stderr (não interfere com o protocolo JSON-RPC).
   * @param msg - Mensagem a ser logada
   */
  function log(msg: string): void {
    process.stderr.write(`[stdio-server] ${msg}\n`)
  }

  // ─── Start ──────────────────────────────────────────────────────

  /** start
   * Descrição: Inicia o servidor, configurando listeners de stdin para receber requisições.
   */
  function start(): void {
    process.stdin.setEncoding('utf-8')
    process.stdin.on('data', handleData)
    process.stdin.on('end', () => {
      log('stdin closed, exiting')
      process.exit(0)
    })

    log('JSON-RPC stdio server ready')
  }

  return { start, sendNotification }
}
