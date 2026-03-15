/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createSummarizationService, pinMessage, isPinnedMessage, PINNED_PREFIX } from './summarize'
import type { ProviderLayer } from '../provider/provider'

function makeProvider(): ProviderLayer {
  return {
    generateText: vi.fn().mockResolvedValue({
      text: 'Resumo: O usuário discutiu X e Y, e o assistente implementou Z.',
      usage: { totalTokens: 50 },
    }),
    listProviders: vi.fn(() => []),
    listModels: vi.fn(() => []),
    streamChat: vi.fn(),
  } as unknown as ProviderLayer
}

describe('pinMessage', () => {
  it('adiciona prefixo PINNED ao conteúdo', () => {
    const result = pinMessage('Important context')
    expect(result).toBe(`${PINNED_PREFIX}Important context`)
  })
})

describe('isPinnedMessage', () => {
  it('retorna true para mensagem com prefixo PINNED', () => {
    expect(isPinnedMessage({ content: `${PINNED_PREFIX}Some content` })).toBe(true)
  })

  it('retorna false para mensagem sem prefixo', () => {
    expect(isPinnedMessage({ content: 'Normal message' })).toBe(false)
  })

  it('retorna false para string vazia', () => {
    expect(isPinnedMessage({ content: '' })).toBe(false)
  })
})

describe('createSummarizationService', () => {
  let provider: ProviderLayer

  beforeEach(() => {
    provider = makeProvider()
  })

  it('cria serviço com método summarize', () => {
    const service = createSummarizationService({
      provider,
      providerId: 'test-provider',
      modelId: 'test-model',
    })

    expect(typeof service.summarize).toBe('function')
  })

  it('retorna mensagens sem alteração quando não há o que comprimir', async () => {
    const service = createSummarizationService({
      provider,
      providerId: 'test',
      modelId: 'test',
    })

    // Menos de PRESERVE_RECENT (6) mensagens → nada a comprimir
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ]

    const result = await service.summarize(messages)
    expect(result).toEqual(messages)
    expect(provider.generateText).not.toHaveBeenCalled()
  })

  it('chama LLM para sumarizar quando há mensagens suficientes', async () => {
    const service = createSummarizationService({
      provider,
      providerId: 'test',
      modelId: 'test',
    })

    // System + mais de 6 mensagens de conversa
    const messages = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Msg 1' },
      { role: 'assistant', content: 'Reply 1' },
      { role: 'user', content: 'Msg 2' },
      { role: 'assistant', content: 'Reply 2' },
      { role: 'user', content: 'Msg 3' },
      { role: 'assistant', content: 'Reply 3' },
      { role: 'user', content: 'Msg 4' },
      { role: 'assistant', content: 'Reply 4' },
      { role: 'user', content: 'Recent 1' },
      { role: 'assistant', content: 'Recent reply 1' },
    ]

    const result = await service.summarize(messages)

    expect(provider.generateText).toHaveBeenCalledTimes(1)
    // System msg preserved
    expect(result[0].role).toBe('system')
    expect(result[0].content).toBe('You are helpful.')
    // Summary message inserted
    const summaryMsg = result.find((m) => m.content.includes('[Conversation Summary]'))
    expect(summaryMsg).toBeDefined()
  })

  it('preserva mensagens pinned durante sumarização', async () => {
    const service = createSummarizationService({
      provider,
      providerId: 'test',
      modelId: 'test',
    })

    const messages = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: `${PINNED_PREFIX}Important context that must persist` },
      { role: 'user', content: 'Msg 1' },
      { role: 'assistant', content: 'Reply 1' },
      { role: 'user', content: 'Msg 2' },
      { role: 'assistant', content: 'Reply 2' },
      { role: 'user', content: 'Msg 3' },
      { role: 'assistant', content: 'Reply 3' },
      { role: 'user', content: 'Msg 4' },
      { role: 'assistant', content: 'Reply 4' },
      { role: 'user', content: 'Recent' },
      { role: 'assistant', content: 'Recent reply' },
    ]

    const result = await service.summarize(messages)

    // Pinned message should be preserved
    const pinned = result.find((m) => m.content.startsWith(PINNED_PREFIX))
    expect(pinned).toBeDefined()
    expect(pinned!.content).toContain('Important context')
  })

  it('preserva mensagens system no início', async () => {
    const service = createSummarizationService({
      provider,
      providerId: 'test',
      modelId: 'test',
    })

    const messages = [
      { role: 'system', content: 'System 1' },
      { role: 'system', content: 'System 2' },
      ...Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      })),
    ]

    const result = await service.summarize(messages)

    expect(result[0].content).toBe('System 1')
    expect(result[1].content).toBe('System 2')
  })

  it('lança erro quando LLM retorna resposta vazia', async () => {
    ;(provider.generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      text: '',
      usage: { totalTokens: 0 },
    })

    const service = createSummarizationService({
      provider,
      providerId: 'test',
      modelId: 'test',
    })

    const messages = [
      { role: 'system', content: 'System' },
      ...Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      })),
    ]

    await expect(service.summarize(messages)).rejects.toThrow('empty response')
  })

  it('chama generateText com temperatura baixa (0.3)', async () => {
    const service = createSummarizationService({
      provider,
      providerId: 'my-provider',
      modelId: 'my-model',
    })

    const messages = [
      { role: 'system', content: 'System' },
      ...Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      })),
    ]

    await service.summarize(messages)

    const callArgs = (provider.generateText as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.provider).toBe('my-provider')
    expect(callArgs.model).toBe('my-model')
    expect(callArgs.temperature).toBe(0.3)
    expect(callArgs.maxTokens).toBe(2048)
  })
})
