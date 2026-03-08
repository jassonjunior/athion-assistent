/**
 * Handler de SSE streaming com pipeline de middlewares.
 * Processa chunks do vllm-mlx, aplica middlewares e re-emite para o cliente.
 */

import type { ProxyLogger, StreamLogData } from './logger'
import type { ProxyConfig, OpenAIStreamChunk } from './types'
import type { ThinkStripperState } from './middleware/think-stripper'
import type { ToolCallExtractorState } from './middleware/tool-call-extractor'
import {
  createThinkStripperState,
  thinkStripperStream,
  isThinkStrippedEmpty,
} from './middleware/think-stripper'
import { toolSanitizerStream } from './middleware/tool-sanitizer'
import {
  createToolCallExtractorState,
  applyToChunk,
  buildToolCallsChunk,
} from './middleware/tool-call-extractor'

/** Opcoes para criar o stream handler. */
export interface StreamHandlerOptions {
  config: ProxyConfig
  logger: ProxyLogger
  contextWindow: number
}

/** Resultado do streaming apos conclusao. */
export interface StreamResult {
  promptTokens: number
  completionTokens: number
  chunkCount: number
  toolCallsExtracted: number
  thinkTagsStripped: boolean
}

/** Contexto interno compartilhado entre as funcoes do stream. */
interface StreamContext {
  config: ProxyConfig
  logger: ProxyLogger
  options: StreamHandlerOptions
  encoder: TextEncoder
  decoder: TextDecoder
  thinkState: ThinkStripperState
  toolCallState: ToolCallExtractorState
  chunkCount: number
  promptTokens: number
  completionTokens: number
  lastChunkId: string | undefined
  lastModel: string | undefined
  startTime: number
  onComplete: ((result: StreamResult) => void) | undefined
}

/** Cria um ReadableStream que processa SSE do backend e aplica middlewares.
 * @param backendResponse - Response do fetch ao vllm-mlx
 * @param options - Opcoes do handler
 * @param onComplete - Callback quando streaming terminar
 * @returns ReadableStream de bytes SSE processados
 */
export function createStreamHandler(
  backendResponse: Response,
  options: StreamHandlerOptions,
  onComplete?: (result: StreamResult) => void,
): ReadableStream<Uint8Array> {
  const ctx: StreamContext = {
    config: options.config,
    logger: options.logger,
    options,
    encoder: new TextEncoder(),
    decoder: new TextDecoder(),
    thinkState: createThinkStripperState(),
    toolCallState: createToolCallExtractorState(),
    chunkCount: 0,
    promptTokens: 0,
    completionTokens: 0,
    lastChunkId: undefined,
    lastModel: undefined,
    startTime: Date.now(),
    onComplete,
  }

  return new ReadableStream({
    async start(controller) {
      try {
        await processStream(backendResponse, controller, ctx)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        ctx.logger.error('Stream processing error', { error: msg })
        controller.error(err)
      }
    },
  })
}

/** Processa o stream SSE do backend, linha por linha. */
async function processStream(
  response: Response,
  controller: ReadableStreamDefaultController<Uint8Array>,
  ctx: StreamContext,
): Promise<void> {
  const body = response.body
  if (!body) {
    controller.close()
    return
  }

  const reader = body.getReader()
  let leftover = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = leftover + ctx.decoder.decode(value, { stream: true })
      const lines = text.split('\n')
      leftover = lines.pop() ?? ''

      for (const line of lines) {
        processLine(line.trim(), controller, ctx)
      }
    }

    if (leftover.trim()) {
      processLine(leftover.trim(), controller, ctx)
    }

    emitExtractedToolCalls(controller, ctx)
    finishStream(controller, ctx)
  } finally {
    reader.releaseLock()
  }
}

/** Processa uma linha SSE individual. */
function processLine(
  line: string,
  controller: ReadableStreamDefaultController<Uint8Array>,
  ctx: StreamContext,
): void {
  if (!line.startsWith('data: ')) return
  const payload = line.slice(6)

  if (payload === '[DONE]') return

  let chunk: OpenAIStreamChunk
  try {
    chunk = JSON.parse(payload)
  } catch {
    ctx.logger.warn('Failed to parse SSE chunk', { payload: payload.slice(0, 100) })
    return
  }

  ctx.lastChunkId = chunk.id
  ctx.lastModel = chunk.model
  if (chunk.usage) {
    ctx.promptTokens = chunk.usage.prompt_tokens
    ctx.completionTokens = chunk.usage.completion_tokens
  }

  const processed = applyMiddlewares(chunk, ctx)
  if (!processed) return

  ctx.chunkCount++
  emitChunk(processed, controller, ctx)
}

/** Aplica pipeline de middlewares a um chunk. */
function applyMiddlewares(chunk: OpenAIStreamChunk, ctx: StreamContext): OpenAIStreamChunk | null {
  let result: OpenAIStreamChunk | null = chunk

  if (ctx.config.thinkStripperEnabled && result) {
    result = thinkStripperStream(result, ctx.thinkState)
    if (result && isThinkStrippedEmpty(result)) return null
  }

  if (ctx.config.toolSanitizerEnabled && result) {
    result = toolSanitizerStream(result)
  }

  if (result) {
    const extracted = applyToChunk(result, ctx.toolCallState)
    if (!extracted) return null
    result = extracted as OpenAIStreamChunk
  }

  return result
}

/** Emite um chunk SSE processado para o cliente. */
function emitChunk(
  chunk: OpenAIStreamChunk,
  controller: ReadableStreamDefaultController<Uint8Array>,
  ctx: StreamContext,
): void {
  const line = `data: ${JSON.stringify(chunk)}\n\n`
  controller.enqueue(ctx.encoder.encode(line))
}

/** Emite tool calls extraidas como chunk final. */
function emitExtractedToolCalls(
  controller: ReadableStreamDefaultController<Uint8Array>,
  ctx: StreamContext,
): void {
  if (!ctx.toolCallState.hasToolCalls || ctx.toolCallState.extractedCalls.length === 0) {
    return
  }

  const tcChunk = buildToolCallsChunk(ctx.toolCallState, ctx.lastChunkId, ctx.lastModel)
  emitChunk(tcChunk as OpenAIStreamChunk, controller, ctx)

  ctx.logger.info('Emitted extracted tool calls', {
    count: ctx.toolCallState.extractedCalls.length,
    tools: ctx.toolCallState.extractedCalls.map((tc: { name: string }) => tc.name),
  })
}

/** Finaliza o stream emitindo [DONE] e logando metricas. */
function finishStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  ctx: StreamContext,
): void {
  controller.enqueue(ctx.encoder.encode('data: [DONE]\n\n'))
  controller.close()

  const result: StreamResult = {
    promptTokens: ctx.promptTokens,
    completionTokens: ctx.completionTokens,
    chunkCount: ctx.chunkCount,
    toolCallsExtracted: ctx.toolCallState.extractedCalls.length,
    thinkTagsStripped: ctx.thinkState.insideThink || ctx.thinkState.buffer.length > 0,
  }

  const logData: StreamLogData = {
    latencyMs: Date.now() - ctx.startTime,
    chunkCount: ctx.chunkCount,
    promptTokens: ctx.promptTokens,
    completionTokens: ctx.completionTokens,
    toolCallsExtracted: ctx.toolCallState.extractedCalls.length,
    thinkTagsStripped: result.thinkTagsStripped,
    contextWindow: ctx.options.contextWindow,
  }
  ctx.logger.logStreamComplete(logData)

  ctx.onComplete?.(result)
}
