import { describe, expect, it, vi } from 'vitest'
import { createOrchestrator } from './orchestrator'
import type { OrchestratorDeps } from './orchestrator'
import type { Session } from './types'

// ── helpers ─────────────────────────────────────────────────────────────────

function makeSession(id = 'sess-1'): Session {
  return { id, projectId: 'proj-1', title: 'Test', createdAt: new Date(), updatedAt: new Date() }
}

/** Cria mocks mínimos para OrchestratorDeps */
function makeDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  const session = makeSession()

  const sessionManager = {
    create: vi.fn(() => session),
    load: vi.fn(() => session),
    list: vi.fn(() => [session]),
    delete: vi.fn(),
    getMessages: vi.fn(() => []),
    addMessage: vi.fn(),
    compress: vi.fn().mockResolvedValue(undefined),
  }

  const tools = {
    register: vi.fn(),
    get: vi.fn(),
    list: vi.fn(() => []),
    has: vi.fn(() => false),
  }

  const tokens = {
    add: vi.fn(),
    trackUsage: vi.fn(),
    budget: vi.fn(() => ({ used: 0, limit: 100_000, ratio: 0 })),
    needsCompaction: vi.fn(() => false),
    reset: vi.fn(),
  }

  const skills = {
    get: vi.fn(() => null),
    list: vi.fn(() => []),
    reload: vi.fn(),
  }

  const bus = {
    publish: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    once: vi.fn(() => vi.fn()),
    clear: vi.fn(),
  }

  const config = {
    get: vi.fn((key: string) => {
      if (key === 'provider') return 'test-provider'
      if (key === 'model') return 'test-model'
      return undefined
    }),
    set: vi.fn(),
    reload: vi.fn(),
    onChanged: vi.fn(),
    getAll: vi.fn(() => ({})),
  }

  const providerStreamEvents = [
    { type: 'content' as const, content: 'Hello!' },
    { type: 'finish' as const, usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
  ]

  async function* mockStream() {
    for (const event of providerStreamEvents) yield event
  }

  const provider = {
    listProviders: vi.fn(() => []),
    listModels: vi.fn(() => []),
    streamChat: vi.fn(() => mockStream()),
    generateText: vi.fn().mockResolvedValue({ text: 'summary', usage: { totalTokens: 10 } }),
  }

  const promptBuilder = {
    build: vi.fn(() => 'System prompt'),
  }

  const toolDispatcher = {
    dispatch: vi.fn().mockResolvedValue({ output: 'ok', error: null }),
  }

  const subagents = {
    list: vi.fn(() => []),
    get: vi.fn(() => null),
    run: vi.fn(),
  }

  return {
    config: config as unknown as OrchestratorDeps['config'],
    bus: bus as unknown as OrchestratorDeps['bus'],
    provider: provider as unknown as OrchestratorDeps['provider'],
    tools: tools as unknown as OrchestratorDeps['tools'],
    tokens: tokens as unknown as OrchestratorDeps['tokens'],
    skills: skills as unknown as OrchestratorDeps['skills'],
    session: sessionManager as unknown as OrchestratorDeps['session'],
    promptBuilder: promptBuilder as unknown as OrchestratorDeps['promptBuilder'],
    toolDispatcher: toolDispatcher as unknown as OrchestratorDeps['toolDispatcher'],
    subagents: subagents as unknown as OrchestratorDeps['subagents'],
    ...overrides,
  }
}

// ── session management ───────────────────────────────────────────────────────

describe('createOrchestrator — session management', () => {
  it('cria uma sessão e retorna os campos corretos', async () => {
    const deps = makeDeps()
    const orch = createOrchestrator(deps)
    const sess = await orch.createSession('proj-1', 'My Session')
    expect(sess.id).toBe('sess-1')
    expect(sess.projectId).toBe('proj-1')
    expect(deps.session.create).toHaveBeenCalledWith('proj-1', 'My Session')
  })

  it('carrega sessão existente pelo ID', async () => {
    const deps = makeDeps()
    const orch = createOrchestrator(deps)
    const sess = await orch.loadSession('sess-1')
    expect(sess.id).toBe('sess-1')
    expect(deps.session.load).toHaveBeenCalledWith('sess-1')
  })

  it('lista sessões', () => {
    const deps = makeDeps()
    const orch = createOrchestrator(deps)
    const sessions = orch.listSessions('proj-1')
    expect(sessions).toHaveLength(1)
    expect(deps.session.list).toHaveBeenCalledWith('proj-1')
  })

  it('deleta sessão', () => {
    const deps = makeDeps()
    const orch = createOrchestrator(deps)
    orch.deleteSession('sess-1')
    expect(deps.session.delete).toHaveBeenCalledWith('sess-1')
  })
})

// ── tool / agent listing ─────────────────────────────────────────────────────

describe('createOrchestrator — listing', () => {
  it('getAvailableTools retorna lista vazia quando nenhuma tool registrada', () => {
    const deps = makeDeps()
    const orch = createOrchestrator(deps)
    expect(orch.getAvailableTools()).toEqual([])
  })

  it('getAvailableAgents retorna lista dos subagentes', () => {
    const subagents = {
      list: vi.fn(() => [
        { name: 'coder', description: 'Coding agent', skill: 'code', tools: ['read_file'] },
      ]),
      get: vi.fn(() => null),
      run: vi.fn(),
    }
    const deps = makeDeps({ subagents: subagents as unknown as OrchestratorDeps['subagents'] })
    const orch = createOrchestrator(deps)
    const agents = orch.getAvailableAgents()
    expect(agents).toHaveLength(1)
    expect(agents[0]?.name).toBe('coder')
  })
})

// ── chat streaming ───────────────────────────────────────────────────────────

describe('createOrchestrator — chat', () => {
  it('emite eventos content e finish em resposta simples', async () => {
    const deps = makeDeps()
    const orch = createOrchestrator(deps)
    await orch.createSession('proj-1')

    const events: unknown[] = []
    for await (const event of orch.chat('sess-1', { content: 'Hi' })) {
      events.push(event)
    }

    const contentEvents = events.filter((e) => (e as { type: string }).type === 'content')
    const finishEvents = events.filter((e) => (e as { type: string }).type === 'finish')
    expect(contentEvents.length).toBeGreaterThan(0)
    expect(finishEvents.length).toBe(1)
  })

  it('chama session.addMessage com role assistant após resposta', async () => {
    const deps = makeDeps()
    const orch = createOrchestrator(deps)
    await orch.createSession('proj-1')

    const gen = orch.chat('sess-1', { content: 'Hi' })
    for await (const event of gen) {
      void event
      // consume
    }

    expect(deps.session.addMessage).toHaveBeenCalledWith('sess-1', 'assistant', 'Hello!')
  })

  it('executa compactação quando tokens.needsCompaction retorna true', async () => {
    const tokens = {
      add: vi.fn(),
      trackUsage: vi.fn(),
      budget: vi.fn(() => ({ used: 90_000, limit: 100_000, ratio: 0.9 })),
      needsCompaction: vi.fn(() => true),
      reset: vi.fn(),
    }

    const providerWithFinish = {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(() => []),
      streamChat: vi.fn(() => {
        async function* gen() {
          yield { type: 'content' as const, content: 'Hi' }
          yield {
            type: 'finish' as const,
            usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
          }
        }
        return gen()
      }),
      generateText: vi.fn().mockResolvedValue({ text: 'summary', usage: { totalTokens: 10 } }),
    }

    const deps = makeDeps({
      tokens: tokens as unknown as OrchestratorDeps['tokens'],
      provider: providerWithFinish as unknown as OrchestratorDeps['provider'],
    })
    const orch = createOrchestrator(deps)
    await orch.createSession('proj-1')

    for await (const ev of orch.chat('sess-1', { content: 'Hi' })) {
      void ev
    }

    expect(deps.session.compress).toHaveBeenCalledWith('sess-1')
  })

  it('emite evento error quando provider lança exceção', async () => {
    async function* failingStream() {
      yield { type: 'error' as const, error: new Error('LLM unavailable') }
    }

    const provider = {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(() => []),
      streamChat: vi.fn(() => failingStream()),
      generateText: vi.fn(),
    }

    const deps = makeDeps({ provider: provider as unknown as OrchestratorDeps['provider'] })
    const orch = createOrchestrator(deps)
    await orch.createSession('proj-1')

    const events: unknown[] = []
    for await (const event of orch.chat('sess-1', { content: 'Hi' })) {
      events.push(event)
    }

    const errorEvents = events.filter((e) => (e as { type: string }).type === 'error')
    expect(errorEvents.length).toBe(1)
  })
})
