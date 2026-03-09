/**
 * StdioServer — JSON-RPC 2.0 server over stdin/stdout.
 *
 * Lê linhas JSON de stdin, despacha para handlers, escreve responses em stdout.
 * Notifications (server → client) são escritas em stdout sem ID.
 *
 * Usado pela extensão VS Code que spawna este processo como child.
 * Logs vão para stderr (não interferem com o protocolo).
 */

import type { AthionCore } from '@athion/core'
import { createHandlers, type RpcHandlers } from './handlers.js'

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: unknown
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: unknown
  error?: { code: number; message: string; data?: unknown }
}

interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params?: unknown
}

const RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INTERNAL_ERROR: -32603,
} as const

export function createStdioServer(core: AthionCore) {
  const handlers = createHandlers(core, sendNotification)
  let buffer = ''

  /** Send JSON-RPC notification to client (via stdout) */
  function sendNotification(method: string, params?: unknown): void {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {}),
    }
    process.stdout.write(JSON.stringify(notification) + '\n')
  }

  /** Send JSON-RPC response to client */
  function sendResponse(response: JsonRpcResponse): void {
    process.stdout.write(JSON.stringify(response) + '\n')
  }

  /** Send error response */
  function sendError(id: number, code: number, message: string): void {
    sendResponse({ jsonrpc: '2.0', id, error: { code, message } })
  }

  /** Dispatch a single JSON-RPC request */
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

  /** Handle incoming data chunk */
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

  /** Log to stderr (does not interfere with JSON-RPC protocol) */
  function log(msg: string): void {
    process.stderr.write(`[stdio-server] ${msg}\n`)
  }

  // ─── Start ──────────────────────────────────────────────────────

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
