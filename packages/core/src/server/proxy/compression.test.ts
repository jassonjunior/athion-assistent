/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unused-vars */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createCompressionService } from './compression'
import type { ProxyConfig, OpenAIChatRequest, OpenAIMessage } from './types'
import type { Tokenizer } from './tokenizer'
import type { ProxyLogger } from './logger'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<ProxyConfig>): ProxyConfig {
  return {
    proxyPort: 1236,
    backendHost: '127.0.0.1',
    backendPort: 8000,
    contextWindow: 10000,
    maxOutputTokens: 2000,
    compressionEnabled: true,
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

function makeTokenizer(tokenCount: number): Tokenizer {
  return {
    countMessages: vi.fn().mockReturnValue(tokenCount),
    countText: vi.fn((text: string) => Math.ceil(text.length / 4)),
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

function makeRequest(messageCount: number): OpenAIChatRequest {
  const messages: OpenAIMessage[] = []
  messages.push({ role: 'system', content: 'You are helpful' })
  for (let i = 0; i < messageCount - 1; i++) {
    messages.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
    })
  }
  return { model: 'test', messages }
}

// ── tests ────────────────────────────────────────────────────────────────────

describe('createCompressionService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna compressed=false quando compression esta desabilitada', async () => {
    const config = makeConfig({ compressionEnabled: false })
    const tokenizer = makeTokenizer(9000)
    const service = createCompressionService(config, tokenizer, makeLogger())

    const result = await service.compressIfNeeded(makeRequest(20))
    expect(result.compressed).toBe(false)
  })

  it('retorna compressed=false quando tokens abaixo do threshold', async () => {
    // contextLimit = max(10000-2000, 5000) = 8000
    // triggerAt = floor(8000 * 0.9) = 7200
    // tokens = 5000 < 7200
    const config = makeConfig()
    const tokenizer = makeTokenizer(5000)
    const service = createCompressionService(config, tokenizer, makeLogger())

    const result = await service.compressIfNeeded(makeRequest(10))
    expect(result.compressed).toBe(false)
    expect(result.originalTokens).toBe(5000)
  })

  it('tenta comprimir quando tokens acima do threshold', async () => {
    // triggerAt = floor(8000 * 0.9) = 7200
    // tokens = 8000 > 7200 → comprime
    const config = makeConfig()
    const tokenizer = makeTokenizer(8000)
    const logger = makeLogger()

    // Mock fetch para simular resposta do LLM
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'Summary of conversation' } }],
        }),
    })

    const service = createCompressionService(config, tokenizer, logger)
    const request = makeRequest(20)
    const result = await service.compressIfNeeded(request)

    // Deve ter tentado comprimir (chamou fetch)
    expect(globalThis.fetch).toHaveBeenCalled()
    expect(result.compressed).toBe(true)
    expect(result.messages[0]!.content).toContain('[Conversation Summary]')

    globalThis.fetch = originalFetch
  })

  it('retorna original messages quando compressao falha', async () => {
    const config = makeConfig()
    const tokenizer = makeTokenizer(8000)
    const logger = makeLogger()

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))

    const service = createCompressionService(config, tokenizer, logger)
    const request = makeRequest(20)
    const result = await service.compressIfNeeded(request)

    expect(result.compressed).toBe(false)
    expect(result.error).toBe('network error')
    expect(result.messages).toBe(request.messages)

    globalThis.fetch = originalFetch
  })

  it('retorna compressed=false quando nao ha mensagens para comprimir', async () => {
    const config = makeConfig()
    // Poucas mensagens (<=6 preserved), nada para comprimir
    const tokenizer = makeTokenizer(8000)
    const logger = makeLogger()

    const service = createCompressionService(config, tokenizer, logger)
    // So 3 mensagens (1 system + 2 rest), preserved=2, toCompress=[system] only
    // Actually com 3 msg total, rest=2, preserveCount=min(6,2)=2, cutoff=0
    // toCompress = [system, ...rest.slice(0,0)] = [system]
    // Hmm, na verdade system sempre entra em toCompress
    // Vamos testar com exatamente 7 mensagens (1 system + 6 rest), tudo preserved
    const request: OpenAIChatRequest = {
      model: 'test',
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'msg1' },
        { role: 'assistant', content: 'msg2' },
        { role: 'user', content: 'msg3' },
        { role: 'assistant', content: 'msg4' },
        { role: 'user', content: 'msg5' },
        { role: 'assistant', content: 'msg6' },
      ],
    }
    // rest=6, preserveCount=min(6,6)=6, cutoff=0
    // toCompress = [system, ...rest.slice(0,0)] = [system]
    // toCompress.length=1, not 0

    // Let's test with no system message and exactly 6 msgs
    const request2: OpenAIChatRequest = {
      model: 'test',
      messages: [
        { role: 'user', content: 'msg1' },
        { role: 'assistant', content: 'msg2' },
        { role: 'user', content: 'msg3' },
        { role: 'assistant', content: 'msg4' },
        { role: 'user', content: 'msg5' },
        { role: 'assistant', content: 'msg6' },
      ],
    }
    // systemMsgs=[], rest=6, preserveCount=min(6,6)=6, cutoff=0
    // toCompress = [...[], ...rest.slice(0,0)] = []
    // toCompress.length=0 → return compressed:false

    const result = await service.compressIfNeeded(request2)
    expect(result.compressed).toBe(false)
    expect(logger.warn).toHaveBeenCalledWith('No messages to compress, all preserved')
  })

  it('lida com LLM retornando resposta vazia', async () => {
    const config = makeConfig()
    const tokenizer = makeTokenizer(8000)
    const logger = makeLogger()

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: '' } }] }),
    })

    const service = createCompressionService(config, tokenizer, logger)
    const request = makeRequest(20)
    const result = await service.compressIfNeeded(request)

    expect(result.compressed).toBe(false)
    expect(result.error).toContain('empty response')

    globalThis.fetch = originalFetch
  })

  it('lida com LLM retornando status de erro', async () => {
    const config = makeConfig()
    const tokenizer = makeTokenizer(8000)
    const logger = makeLogger()

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    const service = createCompressionService(config, tokenizer, logger)
    const request = makeRequest(20)
    const result = await service.compressIfNeeded(request)

    expect(result.compressed).toBe(false)
    expect(result.error).toContain('500')

    globalThis.fetch = originalFetch
  })
})
