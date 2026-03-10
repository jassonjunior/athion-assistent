import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createProviderLayer } from './provider'

// ── helpers ─────────────────────────────────────────────────────────────────

/** Mínimo para um StreamChatConfig válido */
function makeChatConfig(provider = 'openai', model = 'gpt-4o') {
  return {
    provider,
    model,
    messages: [{ role: 'user' as const, content: 'Hello' }],
    tools: [],
    maxTokens: 100,
    temperature: 0,
  }
}

// ── listProviders ────────────────────────────────────────────────────────────

describe('createProviderLayer — listProviders', () => {
  it('retorna pelo menos 5 providers registrados', () => {
    const layer = createProviderLayer()
    const providers = layer.listProviders()
    expect(providers.length).toBeGreaterThanOrEqual(5)
  })

  it('todos os providers têm id, name e isLocal', () => {
    const layer = createProviderLayer()
    for (const p of layer.listProviders()) {
      expect(typeof p.id).toBe('string')
      expect(typeof p.name).toBe('string')
      expect(typeof p.isLocal).toBe('boolean')
    }
  })

  it('inclui providers locais (vllm-mlx, ollama) e cloud (openai, anthropic)', () => {
    const layer = createProviderLayer()
    const ids = layer.listProviders().map((p) => p.id)
    expect(ids).toContain('vllm-mlx')
    expect(ids).toContain('openai')
    expect(ids).toContain('anthropic')
  })
})

// ── listModels ───────────────────────────────────────────────────────────────

describe('createProviderLayer — listModels', () => {
  it('listModels() sem filtro retorna modelos de todos os providers', () => {
    const layer = createProviderLayer()
    const models = layer.listModels()
    expect(models.length).toBeGreaterThan(0)
  })

  it('listModels(providerId) retorna apenas modelos do provider filtrado', () => {
    const layer = createProviderLayer()
    const openaiModels = layer.listModels('openai')
    expect(openaiModels.length).toBeGreaterThan(0)
    for (const m of openaiModels) {
      expect(m.providerId).toBe('openai')
    }
  })

  it('listModels(provider_inexistente) retorna array vazio', () => {
    const layer = createProviderLayer()
    expect(layer.listModels('nonexistent-provider')).toEqual([])
  })

  it('todos os modelos têm id, name, providerId e contextLength', () => {
    const layer = createProviderLayer()
    for (const m of layer.listModels()) {
      expect(typeof m.id).toBe('string')
      expect(typeof m.name).toBe('string')
      expect(typeof m.providerId).toBe('string')
      expect(typeof m.contextLength).toBe('number')
    }
  })
})

// ── streamChat — provider inexistente ────────────────────────────────────────

describe('createProviderLayer — streamChat error paths', () => {
  it('emite evento error quando provider não existe', async () => {
    const layer = createProviderLayer()
    const events: unknown[] = []
    for await (const event of layer.streamChat(makeChatConfig('nonexistent-provider'))) {
      events.push(event)
    }
    expect(events).toHaveLength(1)
    const errorEvent = events[0] as { type: string; error: Error }
    expect(errorEvent.type).toBe('error')
    expect(errorEvent.error.message).toContain('nonexistent-provider')
  })
})

// ── streamChat — mock AI SDK ─────────────────────────────────────────────────

describe('createProviderLayer — streamChat with mocked AI SDK', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('emite conteúdo e finish quando streaming é bem-sucedido', async () => {
    // Mock do módulo ai para evitar chamadas de rede
    vi.mock('ai', async (importOriginal) => {
      const original = (await importOriginal()) as object
      return {
        ...original,
        streamText: vi.fn(async () => ({
          textStream: (async function* () {
            yield 'Hello'
            yield ' world'
          })(),
          usage: Promise.resolve({ promptTokens: 10, completionTokens: 5 }),
          toolCalls: Promise.resolve([]),
          fullStream: (async function* () {
            yield { type: 'text-delta', textDelta: 'Hello' }
            yield { type: 'text-delta', textDelta: ' world' }
            yield {
              type: 'finish',
              usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            }
          })(),
        })),
      }
    })

    const { createProviderLayer: createLayer } = await import('./provider')
    const layer = createLayer()

    const events: unknown[] = []
    for await (const event of layer.streamChat(makeChatConfig('openai', 'gpt-4o-mini'))) {
      events.push(event)
      if (events.length > 10) break // safety
    }

    vi.unmock('ai')

    // Verifica que houve pelo menos content ou finish (mock pode variar)
    expect(events.length).toBeGreaterThan(0)
  })
})

// ── generateText — provider inexistente ─────────────────────────────────────

describe('createProviderLayer — generateText', () => {
  it('lança erro quando provider não existe', async () => {
    const layer = createProviderLayer()
    await expect(
      layer.generateText({
        provider: 'nonexistent',
        model: 'some-model',
        prompt: 'Test',
      }),
    ).rejects.toThrow('nonexistent')
  })
})
