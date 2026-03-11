import { describe, expect, it, vi } from 'vitest'
import { runSubAgent } from './agent'
import type { SubAgentDeps } from './agent'
import type { SubAgentConfig, SubAgentTask } from './types'

// ── helpers ─────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<SubAgentTask> = {}): SubAgentTask {
  return {
    id: 'task-1',
    name: 'test-task',
    description: 'Do something useful',
    status: 'pending',
    steps: [],
    accumulatedResults: [],
    continuationIndex: 0,
    maxContinuations: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function makeConfig(overrides: Partial<SubAgentConfig> = {}): SubAgentConfig {
  return {
    name: 'test-agent',
    description: 'A test agent',
    skill: 'test-skill',
    tools: [],
    level: 'builtin',
    maxTurns: 5,
    ...overrides,
  }
}

function makeDeps(streamEvents: unknown[] = []): SubAgentDeps {
  async function* mockStream() {
    for (const event of streamEvents) yield event
  }

  const provider = {
    listProviders: vi.fn(() => []),
    listModels: vi.fn(() => []),
    streamChat: vi.fn(() => mockStream()),
    generateText: vi.fn().mockResolvedValue({ text: 'summary', usage: { totalTokens: 5 } }),
  }

  const tools = {
    register: vi.fn(),
    get: vi.fn(),
    list: vi.fn(() => []),
    has: vi.fn(() => false),
  }

  const skills = {
    get: vi.fn(() => ({ instructions: 'Be helpful.' })),
    list: vi.fn(() => []),
    reload: vi.fn(),
  }

  return {
    provider: provider as unknown as SubAgentDeps['provider'],
    tools: tools as unknown as SubAgentDeps['tools'],
    skills: skills as unknown as SubAgentDeps['skills'],
    defaultProvider: 'test-provider',
    defaultModel: 'test-model',
  }
}

// ── lifecycle ────────────────────────────────────────────────────────────────

describe('runSubAgent — lifecycle', () => {
  it('emite evento start com task correta', async () => {
    const deps = makeDeps([
      { type: 'content', content: 'Done!' },
      { type: 'finish', usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 } },
    ])
    const config = makeConfig()
    const task = makeTask()

    const events: unknown[] = []
    for await (const event of runSubAgent(config, task, deps)) {
      events.push(event)
    }

    const startEvent = events.find((e) => (e as { type: string }).type === 'start')
    expect(startEvent).toBeDefined()
    expect((startEvent as { agentName: string }).agentName).toBe('test-agent')
  })

  it('emite evento complete ao terminar com sucesso', async () => {
    const deps = makeDeps([
      { type: 'content', content: 'Task completed successfully.' },
      { type: 'finish', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
    ])

    const events: unknown[] = []
    for await (const event of runSubAgent(makeConfig(), makeTask(), deps)) {
      events.push(event)
    }

    const completeEvent = events.find((e) => (e as { type: string }).type === 'complete')
    expect(completeEvent).toBeDefined()
    const task = (completeEvent as { task: SubAgentTask }).task
    expect(task.status).toBe('completed')
  })

  it('emite eventos content durante streaming', async () => {
    const deps = makeDeps([
      { type: 'content', content: 'Part 1 ' },
      { type: 'content', content: 'Part 2' },
      { type: 'finish', usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 } },
    ])

    const events: unknown[] = []
    for await (const event of runSubAgent(makeConfig(), makeTask(), deps)) {
      events.push(event)
    }

    const contentEvents = events.filter((e) => (e as { type: string }).type === 'content')
    expect(contentEvents.length).toBeGreaterThanOrEqual(2)
  })
})

// ── abort ────────────────────────────────────────────────────────────────────

describe('runSubAgent — abort', () => {
  it('para execução quando AbortSignal é abortado antes do início', async () => {
    const controller = new AbortController()
    controller.abort()

    const deps = makeDeps([
      { type: 'content', content: 'Should not appear' },
      { type: 'finish', usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 } },
    ])

    const events: unknown[] = []
    for await (const event of runSubAgent(makeConfig(), makeTask(), deps, controller.signal)) {
      events.push(event)
    }

    const errorEvent = events.find((e) => (e as { type: string }).type === 'error')
    expect(errorEvent).toBeDefined()
    expect((errorEvent as { error: Error }).error.message).toContain('aborted')
  })
})

// ── error handling ────────────────────────────────────────────────────────────

describe('runSubAgent — error handling', () => {
  it('emite evento error quando provider falha', async () => {
    const deps = makeDeps([{ type: 'error', error: new Error('LLM unavailable') }])

    const events: unknown[] = []
    for await (const event of runSubAgent(makeConfig(), makeTask(), deps)) {
      events.push(event)
    }

    const errorEvent = events.find((e) => (e as { type: string }).type === 'error')
    expect(errorEvent).toBeDefined()
  })

  it('usa skill do SkillManager quando disponível', async () => {
    const deps = makeDeps([
      { type: 'content', content: 'Done' },
      { type: 'finish', usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 } },
    ])

    for await (const ev of runSubAgent(makeConfig({ skill: 'test-skill' }), makeTask(), deps)) {
      void ev
    }

    expect(deps.skills.get).toHaveBeenCalledWith('test-skill')
  })

  it('usa defaultProvider/defaultModel quando config.model não definido', async () => {
    const deps = makeDeps([
      { type: 'finish', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
    ])

    for await (const ev of runSubAgent(makeConfig({ model: undefined }), makeTask(), deps)) {
      void ev
    }

    const callArgs = (deps.provider.streamChat as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(callArgs?.provider).toBe('test-provider')
    expect(callArgs?.model).toBe('test-model')
  })

  it('injeta Search Protocol quando search_codebase está nos tools', async () => {
    const deps = makeDeps([
      { type: 'content', content: 'Done' },
      { type: 'finish', usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 } },
    ])

    const config = makeConfig({ tools: ['search_codebase', 'search_files', 'read_file'] })
    for await (const ev of runSubAgent(config, makeTask(), deps)) {
      void ev
    }

    const callArgs = (deps.provider.streamChat as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    const systemMsg = (callArgs?.messages as Array<{ role: string; content: string }>).find(
      (m) => m.role === 'system',
    )
    expect(systemMsg?.content).toContain('Search Protocol')
    expect(systemMsg?.content).toContain('search_codebase')
    expect(systemMsg?.content).toContain('FIRST')
  })

  it('não injeta Search Protocol quando search_codebase não está nos tools', async () => {
    const deps = makeDeps([
      { type: 'content', content: 'Done' },
      { type: 'finish', usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 } },
    ])

    const config = makeConfig({ tools: ['read_file', 'write_file'] })
    for await (const ev of runSubAgent(config, makeTask(), deps)) {
      void ev
    }

    const callArgs = (deps.provider.streamChat as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    const systemMsg = (callArgs?.messages as Array<{ role: string; content: string }>).find(
      (m) => m.role === 'system',
    )
    expect(systemMsg?.content).not.toContain('Search Protocol')
  })

  it('envia nudge quando modelo gera texto sem tool calls pela primeira vez', async () => {
    let callCount = 0
    const provider = {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(() => []),
      streamChat: vi.fn(() => {
        callCount++
        return (async function* () {
          yield { type: 'content', content: `Resposta ${callCount}` }
        })()
      }),
      generateText: vi.fn().mockResolvedValue({ text: 'summary', usage: { totalTokens: 5 } }),
    }

    const deps: SubAgentDeps = {
      provider: provider as unknown as SubAgentDeps['provider'],
      tools: {
        register: vi.fn(),
        get: vi.fn(),
        list: vi.fn(() => [{ name: 'read_file', description: 'Read a file', parameters: {} }]),
        has: vi.fn(() => false),
      } as unknown as SubAgentDeps['tools'],
      skills: {
        get: vi.fn(() => null),
        list: vi.fn(() => []),
        reload: vi.fn(),
      } as unknown as SubAgentDeps['skills'],
      defaultProvider: 'test-provider',
      defaultModel: 'test-model',
    }

    const config = makeConfig({ tools: ['read_file'], maxTurns: 5 })
    const events: unknown[] = []
    for await (const event of runSubAgent(config, makeTask(), deps)) {
      events.push(event)
    }

    // Deve ter chamado streamChat 2x: 1 original + 1 após nudge
    expect(callCount).toBe(2)

    // Tarefa deve terminar como completa (segundo texto aceito como resposta final)
    const completeEvent = events.find((e) => (e as { type: string }).type === 'complete')
    expect(completeEvent).toBeDefined()
  })

  it('não envia nudge quando não há tools disponíveis (texto é resposta final imediata)', async () => {
    let callCount = 0
    const provider = {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(() => []),
      streamChat: vi.fn(() => {
        callCount++
        return (async function* () {
          yield { type: 'content', content: 'Esta é minha resposta final.' }
        })()
      }),
      generateText: vi.fn().mockResolvedValue({ text: 'summary', usage: { totalTokens: 5 } }),
    }

    const deps = makeDeps([{ type: 'content', content: 'Esta é minha resposta final.' }])
    // makeDeps retorna tools.list = [], então providerTools é vazio → sem nudge

    const config = makeConfig({ tools: [], maxTurns: 5 })
    const events: unknown[] = []
    for await (const event of runSubAgent(config, makeTask(), {
      ...deps,
      provider: provider as unknown as SubAgentDeps['provider'],
    })) {
      events.push(event)
    }

    // Sem tools, não há nudge — apenas 1 chamada
    expect(callCount).toBe(1)
    const completeEvent = events.find((e) => (e as { type: string }).type === 'complete')
    expect(completeEvent).toBeDefined()
  })

  it('respeita maxTurns para prevenir loops infinitos', async () => {
    // Provider sempre retorna tool_call sem finish — força uso de maxTurns
    let callCount = 0
    async function* infiniteToolCalls() {
      callCount++
      yield {
        type: 'tool-call' as const,
        toolCallId: `call-${callCount}`,
        toolName: 'some_tool',
        args: {},
      }
      yield {
        type: 'finish' as const,
        usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
      }
    }

    const providerInfinite = {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(() => []),
      streamChat: vi.fn(() => infiniteToolCalls()),
      generateText: vi.fn().mockResolvedValue({ text: 'summary', usage: { totalTokens: 5 } }),
    }

    const deps: SubAgentDeps = {
      provider: providerInfinite as unknown as SubAgentDeps['provider'],
      tools: {
        register: vi.fn(),
        get: vi.fn(),
        list: vi.fn(() => []),
        has: vi.fn(() => false),
      } as unknown as SubAgentDeps['tools'],
      skills: {
        get: vi.fn(() => null),
        list: vi.fn(() => []),
        reload: vi.fn(),
      } as unknown as SubAgentDeps['skills'],
      defaultProvider: 'test-provider',
      defaultModel: 'test-model',
    }

    const events: unknown[] = []
    const config = makeConfig({ maxTurns: 3 })
    for await (const event of runSubAgent(config, makeTask(), deps)) {
      events.push(event)
      if (events.length > 50) break // safety net
    }

    // Deve encerrar antes de atingir um loop infinito
    expect(callCount).toBeLessThanOrEqual((config.maxTurns ?? 50) + 1)
  })
})
