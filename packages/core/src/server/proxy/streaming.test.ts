import { describe, expect, it, vi } from 'vitest'
import { createStreamHandler } from './streaming'
import type { StreamHandlerOptions } from './streaming'
import type { ProxyConfig } from './types'
import type { ProxyLogger } from './logger'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<ProxyConfig>): ProxyConfig {
  return {
    proxyPort: 1236,
    backendHost: '127.0.0.1',
    backendPort: 8000,
    contextWindow: 10000,
    maxOutputTokens: 2000,
    compressionEnabled: false,
    compressionTriggerThreshold: 0.9,
    compressionPreserveFraction: 0.3,
    safetyGuardEnabled: false,
    thinkStripperEnabled: false,
    toolSanitizerEnabled: false,
    modelTtlMinutes: 30,
    logLevel: 'info',
    ...overrides,
  }
}

function makeLogger(): ProxyLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    logRequest: vi.fn(),
    logResponse: vi.fn(),
    logStreamComplete: vi.fn(),
  }
}

function makeOptions(configOverrides?: Partial<ProxyConfig>): StreamHandlerOptions {
  return {
    config: makeConfig(configOverrides),
    logger: makeLogger(),
    contextWindow: 10000,
    messageCount: 5,
    requestNumber: 1,
  }
}

function sseData(chunk: Record<string, unknown>): string {
  return `data: ${JSON.stringify(chunk)}\n\n`
}

function makeSSEResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
      }
      controller.close()
    },
  })
  return new Response(stream)
}

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value)
  }
  return result
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('createStreamHandler', () => {
  it('processa stream SSE simples e emite [DONE]', async () => {
    const chunk1 = {
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test',
      choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello' }, finish_reason: null }],
    }
    const chunk2 = {
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test',
      choices: [{ index: 0, delta: { content: ' World' }, finish_reason: 'stop' }],
    }

    const response = makeSSEResponse([sseData(chunk1), sseData(chunk2), 'data: [DONE]\n\n'])

    const options = makeOptions()
    const stream = createStreamHandler(response, options)
    const output = await readStream(stream)

    expect(output).toContain('"Hello"')
    expect(output).toContain('" World"')
    expect(output).toContain('data: [DONE]')
  })

  it('chama onComplete callback com resultado', async () => {
    const chunk = {
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test',
      choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }

    const response = makeSSEResponse([sseData(chunk), 'data: [DONE]\n\n'])
    const options = makeOptions()

    let completionResult: unknown = null
    const stream = createStreamHandler(response, options, (result) => {
      completionResult = result
    })
    await readStream(stream)

    expect(completionResult).toBeTruthy()
    const result = completionResult as {
      promptTokens: number
      completionTokens: number
      chunkCount: number
    }
    expect(result.promptTokens).toBe(10)
    expect(result.completionTokens).toBe(5)
    expect(result.chunkCount).toBe(1)
  })

  it('ignora linhas que nao sao data:', async () => {
    const chunk = {
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test',
      choices: [{ index: 0, delta: { content: 'OK' }, finish_reason: 'stop' }],
    }

    const response = makeSSEResponse([
      'event: message\n',
      sseData(chunk),
      ': comment\n',
      'data: [DONE]\n\n',
    ])

    const options = makeOptions()
    const stream = createStreamHandler(response, options)
    const output = await readStream(stream)

    expect(output).toContain('"OK"')
    expect(output).toContain('[DONE]')
  })

  it('fecha graciosamente com body vazio', async () => {
    const response = new Response(null)
    const options = makeOptions()
    const stream = createStreamHandler(response, options)
    const output = await readStream(stream)

    // Body null: processStream fecha o controller imediatamente sem emitir nada
    expect(output).toBe('')
  })

  it('aplica think-stripper quando habilitado', async () => {
    const chunk = {
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test',
      choices: [
        { index: 0, delta: { content: '<think>hidden</think>visible' }, finish_reason: null },
      ],
    }
    const doneChunk = {
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    }

    const response = makeSSEResponse([sseData(chunk), sseData(doneChunk), 'data: [DONE]\n\n'])
    const options = makeOptions({ thinkStripperEnabled: true })
    const stream = createStreamHandler(response, options)
    const output = await readStream(stream)

    expect(output).toContain('visible')
    expect(output).not.toContain('hidden')
  })

  it('acumula tool calls do delta', async () => {
    const chunk1 = {
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test',
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [
              {
                index: 0,
                id: 'tc1',
                type: 'function',
                function: { name: 'read', arguments: '{"pa' },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    }
    const chunk2 = {
      id: 'c1',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'test',
      choices: [
        {
          index: 0,
          delta: {
            tool_calls: [{ index: 0, function: { arguments: 'th":"/f"}' } }],
          },
          finish_reason: null,
        },
      ],
    }

    const response = makeSSEResponse([sseData(chunk1), sseData(chunk2), 'data: [DONE]\n\n'])
    const options = makeOptions()
    const stream = createStreamHandler(response, options)
    const output = await readStream(stream)

    // Stream should have processed chunks
    expect(output).toContain('[DONE]')
  })

  it('loga warning para chunk JSON invalido', async () => {
    const response = makeSSEResponse(['data: {invalid json}\n\n', 'data: [DONE]\n\n'])

    const options = makeOptions()
    const stream = createStreamHandler(response, options)
    await readStream(stream)

    expect(options.logger.warn).toHaveBeenCalledWith(
      'Failed to parse SSE chunk',
      expect.any(Object),
    )
  })
})
