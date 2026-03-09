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

/** Interface do proxy server. */
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
  _lastMessageCount: number
  _requestCounter: number
}

/** Cria e retorna o proxy server. */
export function createProxy(config: ProxyConfig): ProxyServer {
  const logDir = (process.env.HOME ?? '.') + '/.athion/logs'
  const logger = createProxyLogger('proxy', config.logLevel, logDir)
  const tokenizer = createTokenizer()
  const compression = createCompressionService(config, tokenizer, logger)

  const deps: ProxyDeps = {
    config,
    logger,
    tokenizer,
    compression,
    backend: backendUrl(config),
    contextLimit: effectiveContextLimit(config),
    _lastMessageCount: 0,
    _requestCounter: 0,
  }

  let server: ReturnType<typeof Bun.serve> | null = null

  return {
    start() {
      try {
        server = Bun.serve({
          port: config.proxyPort,
          reusePort: true,
          idleTimeout: 255,
          fetch: (req) => handleRequest(req, deps),
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('EADDRINUSE') || msg.includes('in use')) {
          logger.warn(`Port ${config.proxyPort} in use, killing previous process...`)
          Bun.spawnSync(['kill', '-9', ...findPidsOnPort(config.proxyPort)])
          server = Bun.serve({
            port: config.proxyPort,
            reusePort: true,
            idleTimeout: 255,
            fetch: (req) => handleRequest(req, deps),
          })
        } else {
          throw err
        }
      }
      logger.info(`Proxy listening on http://localhost:${config.proxyPort}`, {
        backend: deps.backend,
        contextWindow: config.contextWindow,
      })
    },
    stop() {
      server?.stop(true)
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

/** Roteador principal de requests. */
async function handleRequest(req: Request, deps: ProxyDeps): Promise<Response> {
  const url = new URL(req.url)

  if (url.pathname === '/v1/chat/completions' && req.method === 'POST') {
    return handleChatCompletions(req, deps)
  }

  return proxyPassthrough(req, url, deps)
}

/** Proxy passthrough para endpoints nao-chat. */
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

/** Handler principal para /v1/chat/completions. */
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

/** Trata request streaming via SSE. */
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
    messageCount: deps._lastMessageCount,
    requestNumber: deps._requestCounter,
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

/** Trata request non-streaming. */
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

/** Loga dados do request recebido. */
function logRequest(body: OpenAIChatRequest, compressionApplied: boolean, deps: ProxyDeps): void {
  deps._lastMessageCount = body.messages.length
  deps._requestCounter++
  const tokens = deps.tokenizer.countMessages(body.messages)

  const toolSummaries = (body.tools ?? []).map((t) => ({
    name: t.function.name,
    description: t.function.description,
    parameterNames: extractParamNames(t.function.parameters),
  }))

  const messages = body.messages.map((m, i) => ({
    index: i,
    role: m.role,
    contentLength: (m.content ?? '').length,
    content: m.content ?? '',
    ...(m.tool_calls
      ? {
          toolCalls: m.tool_calls.map((tc) => ({
            name: tc.function.name,
            arguments: tc.function.arguments,
          })),
        }
      : {}),
    ...(m.tool_call_id ? { toolCallId: m.tool_call_id } : {}),
  }))

  deps.logger.logRequest({
    requestNumber: deps._requestCounter,
    model: body.model,
    messageCount: body.messages.length,
    hasTools: toolSummaries.length > 0,
    toolCount: toolSummaries.length,
    toolSummaries,
    promptTokens: tokens,
    contextWindow: deps.config.contextWindow,
    compressionApplied,
    stream: body.stream ?? false,
    maxTokens: body.max_tokens,
    messages,
  })
}

/** Extrai nomes dos parametros de um JSON Schema. */
function extractParamNames(schema: unknown): string[] {
  if (schema && typeof schema === 'object' && 'properties' in schema) {
    const props = (schema as { properties: Record<string, unknown> }).properties
    return Object.keys(props)
  }
  return []
}

/** Loga dados da response. */
function logResponse(response: OpenAIChatResponse, startTime: number, deps: ProxyDeps): void {
  const toolCalls = response.choices
    .flatMap((c) => c.message.tool_calls ?? [])
    .map((tc) => ({ name: tc.function.name, arguments: tc.function.arguments }))

  const content = response.choices[0]?.message?.content ?? ''

  deps.logger.logResponse({
    requestNumber: deps._requestCounter,
    latencyMs: Date.now() - startTime,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
    toolCalls,
    finishReason: response.choices[0]?.finish_reason ?? 'unknown',
    middlewaresApplied: collectMiddlewareNames(deps.config),
    contextWindow: deps.config.contextWindow,
    content,
    messageCount: deps._lastMessageCount,
  })
}

/** Lista middlewares ativos. */
function collectMiddlewareNames(config: ProxyConfig): string[] {
  const names: string[] = []
  if (config.thinkStripperEnabled) names.push('think-stripper')
  if (config.toolSanitizerEnabled) names.push('tool-sanitizer')
  if (config.safetyGuardEnabled) names.push('safety-guard')
  if (config.compressionEnabled) names.push('compression')
  return names
}

/** Encontra PIDs usando uma porta via lsof. */
function findPidsOnPort(port: number): string[] {
  const result = Bun.spawnSync(['lsof', '-ti', `:${port}`])
  const output = result.stdout.toString().trim()
  if (!output) return []
  return output.split('\n').filter(Boolean)
}
