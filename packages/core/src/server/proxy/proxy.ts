/**
 * Proxy HTTP entre Athion e vllm-mlx.
 * Intercepta, processa e encaminha requests OpenAI-compatible.
 */

import type { ProxyConfig, OpenAIChatRequest, OpenAIChatResponse } from './types'
import { backendUrl, effectiveContextLimit } from './types'
import { createProxyLogger } from './logger'
import type { ProxyLogger } from './logger'
import { createTokenizer } from './tokenizer'
import type { Tokenizer } from './tokenizer'
import { createCompressionService } from './compression'
import type { CompressionService } from './compression'
import { safetyGuardPreCheck, safetyGuard } from './middleware/safety-guard'
import { thinkStripper } from './middleware/think-stripper'
import { toolSanitizer } from './middleware/tool-sanitizer'
import { createStreamHandler } from './streaming'

/** Interface do proxy server.
 * @typedef {Object} ProxyServer
 * @property {function} start - Inicia o proxy.
 * @property {function} stop - Para o proxy.
 * @property {number} port - Porta do proxy.
 * @property {string} url - URL do proxy.
 * @example
 * const proxy: ProxyServer = { start: () => {}, stop: () => {}, port: 1236, url: 'http://localhost:1236' }
 */
export interface ProxyServer {
  start(): void
  stop(): void
  readonly port: number
  readonly url: string
}

/** Dependencias internas do proxy. */
interface ProxyDeps {
  config: ProxyConfig
  logger: ProxyLogger
  tokenizer: Tokenizer
  compression: CompressionService
  backend: string
  contextLimit: number
}

/** Cria e retorna o proxy server.
 * @param config - Configuracao do proxy
 * @returns ProxyServer
 */
export function createProxy(config: ProxyConfig): ProxyServer {
  const logger = createProxyLogger('proxy', config.logLevel)
  const tokenizer = createTokenizer()
  const compression = createCompressionService(config, tokenizer, logger)

  const deps: ProxyDeps = {
    config,
    logger,
    tokenizer,
    compression,
    backend: backendUrl(config),
    contextLimit: effectiveContextLimit(config),
  }

  let server: ReturnType<typeof Bun.serve> | null = null

  return {
    start() {
      server = Bun.serve({
        port: config.proxyPort,
        fetch: (req) => handleRequest(req, deps),
      })
      logger.info(`Proxy listening on http://localhost:${config.proxyPort}`, {
        backend: deps.backend,
        contextWindow: config.contextWindow,
      })
    },
    stop() {
      server?.stop()
      logger.info('Proxy stopped')
    },
    get port() {
      return config.proxyPort
    },
    get url() {
      return `http://localhost:${config.proxyPort}`
    },
  }
}

/** Roteador principal de requests.
 * @param req - Request do proxy.
 * @param deps - Dependencias do proxy.
 * @returns Response do proxy.
 * @example
 * const req = new Request('http://localhost:1236/v1/chat/completions', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello, how are you?' }] }) })
 * const deps = { config: ProxyConfigSchema.parse({}), logger: createProxyLogger('proxy', 'info'), tokenizer: createTokenizer(), compression: createCompressionService(config, tokenizer, logger), backend: 'http://localhost:8000', contextLimit: 1000 }
 * const res = await handleRequest(req, deps)
 */
async function handleRequest(req: Request, deps: ProxyDeps): Promise<Response> {
  const url = new URL(req.url)

  if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
    return handleChatCompletions(req, deps)
  }

  // Proxy passthrough para outros endpoints
  return proxyPassthrough(req, url, deps)
}

/** Proxy passthrough para endpoints nao-chat.
 * @param req - Request do proxy.
 * @param url - URL do proxy.
 * @param deps - Dependencias do proxy.
 * @returns Response do proxy.
 * @example
 * const req = new Request('http://localhost:1236/v1/chat/completions', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello, how are you?' }] }) })
 * const url = new URL('http://localhost:1236/v1/chat/completions')
 * const deps = { config: ProxyConfigSchema.parse({}), logger: createProxyLogger('proxy', 'info'), tokenizer: createTokenizer(), compression: createCompressionService(config, tokenizer, logger), backend: 'http://localhost:8000', contextLimit: 1000 }
 * const res = await proxyPassthrough(req, url, deps)
 */
async function proxyPassthrough(req: Request, url: URL, deps: ProxyDeps): Promise<Response> {
  const target = `${deps.backend}${url.pathname}${url.search}`
  try {
    const res = await fetch(target, {
      method: req.method,
      headers: req.headers,
      body: req.body,
    })
    return new Response(res.body, {
      status: res.status,
      headers: res.headers,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    deps.logger.error('Passthrough failed', { error: msg, path: url.pathname })
    return Response.json({ error: msg }, { status: 502 })
  }
}

/** Handler principal para /v1/chat/completions.
 * @param req - Request do proxy.
 * @param deps - Dependencias do proxy.
 * @returns Response do proxy.
 * @example
 * const req = new Request('http://localhost:1236/v1/chat/completions', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello, how are you?' }] }) })
 * const deps = { config: ProxyConfigSchema.parse({}), logger: createProxyLogger('proxy', 'info'), tokenizer: createTokenizer(), compression: createCompressionService(config, tokenizer, logger), backend: 'http://localhost:8000', contextLimit: 1000 }
 * const res = await handleChatCompletions(req, deps)
 */
async function handleChatCompletions(req: Request, deps: ProxyDeps): Promise<Response> {
  const body = (await req.json()) as OpenAIChatRequest
  const startTime = Date.now()

  // Pre-check: safety guard
  if (deps.config.safetyGuardEnabled) {
    const preCheck = safetyGuardPreCheck(body)
    if (preCheck.blocked) {
      deps.logger.warn('Safety guard blocked request', { reason: 'pre-check' })
      return Response.json(preCheck.response)
    }
  }

  // Compressao de contexto
  const compressResult = await deps.compression.compressIfNeeded(body)
  if (compressResult.compressed) {
    body.messages = compressResult.messages
  }

  // Log do request
  logRequest(body, compressResult.compressed, deps)

  // Forward para backend
  if (body.stream) {
    return handleStreaming(body, deps)
  }
  return handleNonStreaming(body, startTime, deps)
}

/** Trata request streaming via SSE.
 * @param body - Body do request.
 * @param deps - Dependencias do proxy.
 * @returns Response do proxy.
 * @example
 * const body: OpenAIChatRequest = { messages: [{ role: 'user', content: 'Hello, how are you?' }] }
 * const deps = { config: ProxyConfigSchema.parse({}), logger: createProxyLogger('proxy', 'info'), tokenizer: createTokenizer(), compression: createCompressionService(config, tokenizer, logger), backend: 'http://localhost:8000', contextLimit: 1000 }
 * const res = await handleStreaming(body, deps)
 */
async function handleStreaming(body: OpenAIChatRequest, deps: ProxyDeps): Promise<Response> {
  const target = `${deps.backend}/v1/chat/completions`

  const res = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    deps.logger.error('Backend streaming error', {
      status: res.status,
      body: errText.slice(0, 200),
    })
    return new Response(errText, { status: res.status })
  }

  const stream = createStreamHandler(res, {
    config: deps.config,
    logger: deps.logger,
    contextWindow: deps.config.contextWindow,
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

/** Trata request non-streaming.
 * @param body - Body do request.
 * @param startTime - Tempo de inicio do request.
 * @param deps - Dependencias do proxy.
 * @returns Response do proxy.
 * @example
 * const body: OpenAIChatRequest = { messages: [{ role: 'user', content: 'Hello, how are you?' }] }
 * const startTime = Date.now()
 * const deps = { config: ProxyConfigSchema.parse({}), logger: createProxyLogger('proxy', 'info'), tokenizer: createTokenizer(), compression: createCompressionService(config, tokenizer, logger), backend: 'http://localhost:8000', contextLimit: 1000 }
 * const res = await handleNonStreaming(body, startTime, deps)
 */
async function handleNonStreaming(
  body: OpenAIChatRequest,
  startTime: number,
  deps: ProxyDeps,
): Promise<Response> {
  const target = `${deps.backend}/v1/chat/completions`

  const res = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text()
    deps.logger.error('Backend error', { status: res.status, body: errText.slice(0, 200) })
    return new Response(errText, { status: res.status })
  }

  let response = (await res.json()) as OpenAIChatResponse

  // Post-middlewares
  if (deps.config.thinkStripperEnabled) {
    response = thinkStripper(response)
  }
  if (deps.config.toolSanitizerEnabled) {
    response = toolSanitizer(response)
  }
  if (deps.config.safetyGuardEnabled) {
    const safetyResult = safetyGuard(response)
    if (safetyResult.blocked) {
      return Response.json(safetyResult.response)
    }
  }

  logResponse(response, startTime, deps)
  return Response.json(response)
}

/** Loga dados do request recebido.
 * @param body - Body do request.
 * @param compressionApplied - Se a compressao foi aplicada.
 * @param deps - Dependencias do proxy.
 * @returns void
 * @example
 * const body: OpenAIChatRequest = { messages: [{ role: 'user', content: 'Hello, how are you?' }] }
 * const compressionApplied = true
 * const deps = { config: ProxyConfigSchema.parse({}), logger: createProxyLogger('proxy', 'info'), tokenizer: createTokenizer(), compression: createCompressionService(config, tokenizer, logger), backend: 'http://localhost:8000', contextLimit: 1000 }
 * logRequest(body, compressionApplied, deps)
 */
function logRequest(body: OpenAIChatRequest, compressionApplied: boolean, deps: ProxyDeps): void {
  const tokens = deps.tokenizer.countMessages(body.messages)
  deps.logger.logRequest({
    model: body.model,
    messageCount: body.messages.length,
    hasTools: (body.tools?.length ?? 0) > 0,
    promptTokens: tokens,
    contextWindow: deps.config.contextWindow,
    compressionApplied,
    safetyBlocked: false,
  })
}

/** Loga dados da response.
 * @param response - Response do proxy.
 * @param startTime - Tempo de inicio do request.
 * @param deps - Dependencias do proxy.
 * @returns void
 * @example
 * const response: OpenAIChatResponse = { choices: [{ message: { role: 'assistant', content: 'Hello, how are you?' } }] }
 * const startTime = Date.now()
 * const deps = { config: ProxyConfigSchema.parse({}), logger: createProxyLogger('proxy', 'info'), tokenizer: createTokenizer(), compression: createCompressionService(config, tokenizer, logger), backend: 'http://localhost:8000', contextLimit: 1000 }
 * logResponse(response, startTime, deps)
 */
function logResponse(response: OpenAIChatResponse, startTime: number, deps: ProxyDeps): void {
  const toolCalls = response.choices
    .flatMap((c) => c.message.tool_calls ?? [])
    .map((tc) => tc.function.name)

  deps.logger.logResponse({
    latencyMs: Date.now() - startTime,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
    toolCalls,
    finishReason: response.choices[0]?.finish_reason ?? 'unknown',
    middlewaresApplied: collectMiddlewareNames(deps.config),
    contextWindow: deps.config.contextWindow,
  })
}

/** Lista middlewares ativos.
 * @param config - Configuracao do proxy.
 * @returns string[]
 * @example
 * const config: ProxyConfig = { thinkStripperEnabled: true, toolSanitizerEnabled: true, safetyGuardEnabled: true, compressionEnabled: true }
 * const names = collectMiddlewareNames(config)
 * console.log(names) // ['think-stripper', 'tool-sanitizer', 'safety-guard', 'compression']
 */
function collectMiddlewareNames(config: ProxyConfig): string[] {
  const names: string[] = []
  if (config.thinkStripperEnabled) names.push('think-stripper')
  if (config.toolSanitizerEnabled) names.push('tool-sanitizer')
  if (config.safetyGuardEnabled) names.push('safety-guard')
  if (config.compressionEnabled) names.push('compression')
  return names
}
