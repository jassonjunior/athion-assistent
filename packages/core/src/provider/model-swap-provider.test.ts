/**
 * Testes para createModelSwapProvider.
 *
 * Cobre:
 * 1. Nenhum swap quando vLLM não iniciou (currentModel vazio)
 * 2. Nenhum swap quando modelo solicitado == modelo atual
 * 3. Swap correto quando modelos diferem (model_loading → swapModel → model_ready)
 * 4. Integração com o Orchestrator: eventos model_loading/model_ready propagados
 * 5. Cenário completo: orchestrator delega ao subagente (tool_call), validando
 *    que os eventos de swap ocorrem antes e depois da chamada ao agente.
 */

import { describe, expect, it, vi } from 'vitest'
import { createModelSwapProvider } from './model-swap-provider'
import { createOrchestrator } from '../orchestrator/orchestrator'
import type { OrchestratorDeps } from '../orchestrator/orchestrator'
import type { VllmManager } from '../server/vllm-manager'
import type { ProviderLayer } from './provider'
import type { StreamEvent } from './types'
import type { Session } from '../orchestrator/types'

// ── helpers ──────────────────────────────────────────────────────────────────

/** Cria mock do VllmManager com currentModel mutável */
function makeVllm(initialModel = ''): VllmManager & { _currentModel: string } {
  const state = { model: initialModel }
  return {
    get currentModel() {
      return state.model
    },
    get _currentModel() {
      return state.model
    },
    set _currentModel(v: string) {
      state.model = v
    },
    swapModel: vi.fn().mockImplementation(async (model: string) => {
      state.model = model
    }),
    isRunning: vi.fn().mockResolvedValue(true),
    ensureRunning: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    touch: vi.fn(),
    baseUrl: 'http://localhost:8000',
  }
}

/** Cria AsyncGenerator a partir de uma lista de eventos */
async function* makeStream(events: StreamEvent[]) {
  for (const e of events) yield e
}

/** Cria mock do ProviderLayer */
function makeBaseProvider(
  streams: StreamEvent[][] = [
    [
      { type: 'content', content: 'ok' },
      { type: 'finish', usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 } },
    ],
  ],
): ProviderLayer {
  let callCount = 0
  return {
    listProviders: vi.fn(() => []),
    listModels: vi.fn(() => []),
    streamChat: vi.fn(() => makeStream(streams[callCount++ % streams.length] ?? [])),
    generateText: vi.fn().mockResolvedValue({ text: 'summary', usage: { totalTokens: 10 } }),
  }
}

function makeSession(id = 'sess-1'): Session {
  return { id, projectId: 'proj-1', title: 'Test', createdAt: new Date(), updatedAt: new Date() }
}

/** Cria OrchestratorDeps com config que suporta orchestratorModel/agentModel */
function makeOrchestratorDeps(
  overrides: Partial<OrchestratorDeps> & {
    orchestratorModel?: string
    agentModel?: string
    customProvider?: ProviderLayer
  } = {},
): OrchestratorDeps {
  const { orchestratorModel, agentModel, customProvider, ...depOverrides } = overrides
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

  const config = {
    get: vi.fn((key: string) => {
      if (key === 'provider') return 'vllm-mlx'
      if (key === 'model') return 'default-model'
      if (key === 'orchestratorModel') return orchestratorModel ?? undefined
      if (key === 'agentModel') return agentModel ?? undefined
      return undefined
    }),
    set: vi.fn(),
    reload: vi.fn(),
    onChanged: vi.fn(),
    getAll: vi.fn(() => ({})),
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
    detectLoop: vi.fn(() => ({ detected: false })),
  }

  const provider = customProvider ?? makeBaseProvider()

  return {
    config: config as unknown as OrchestratorDeps['config'],
    bus: {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
      once: vi.fn(() => vi.fn()),
      clear: vi.fn(),
    } as unknown as OrchestratorDeps['bus'],
    provider: provider as unknown as OrchestratorDeps['provider'],
    tools: tools as unknown as OrchestratorDeps['tools'],
    tokens: tokens as unknown as OrchestratorDeps['tokens'],
    skills: {
      get: vi.fn(() => null),
      list: vi.fn(() => []),
      reload: vi.fn(),
    } as unknown as OrchestratorDeps['skills'],
    session: sessionManager as unknown as OrchestratorDeps['session'],
    promptBuilder: {
      build: vi.fn(() => 'System prompt'),
    } as unknown as OrchestratorDeps['promptBuilder'],
    toolDispatcher: {
      dispatch: vi.fn().mockResolvedValue({ success: true, data: 'task done' }),
    } as unknown as OrchestratorDeps['toolDispatcher'],
    subagents: {
      list: vi.fn(() => []),
      get: vi.fn(() => null),
      run: vi.fn(),
      registerAgent: vi.fn(),
      getAgent: vi.fn(),
      spawn: vi.fn(),
    } as unknown as OrchestratorDeps['subagents'],
    ...depOverrides,
  }
}

// ── createModelSwapProvider — unit tests ──────────────────────────────────────

describe('createModelSwapProvider — sem swap necessário', () => {
  it('não faz swap quando vLLM não iniciou (currentModel vazio)', async () => {
    const vllm = makeVllm('') // vllm não iniciou — currentModel = ''
    const base = makeBaseProvider()
    const swapProvider = createModelSwapProvider(base, vllm)

    const events: StreamEvent[] = []
    for await (const e of swapProvider.streamChat({
      provider: 'vllm-mlx',
      model: 'qwen3.5',
      messages: [{ role: 'user', content: 'oi' }],
    })) {
      events.push(e)
    }

    expect(vllm.swapModel).not.toHaveBeenCalled()
    expect(events.every((e) => e.type !== 'model_loading')).toBe(true)
    expect(events.every((e) => e.type !== 'model_ready')).toBe(true)
  })

  it('não faz swap quando o modelo solicitado já está carregado', async () => {
    const vllm = makeVllm('qwen3.5') // modelo já carregado
    const base = makeBaseProvider()
    const swapProvider = createModelSwapProvider(base, vllm)

    const events: StreamEvent[] = []
    for await (const e of swapProvider.streamChat({
      provider: 'vllm-mlx',
      model: 'qwen3.5', // mesmo modelo
      messages: [{ role: 'user', content: 'oi' }],
    })) {
      events.push(e)
    }

    expect(vllm.swapModel).not.toHaveBeenCalled()
    expect(events.find((e) => e.type === 'model_loading')).toBeUndefined()
  })
})

describe('createModelSwapProvider — com swap', () => {
  it('emite model_loading → chama swapModel → emite model_ready quando modelo muda', async () => {
    const vllm = makeVllm('qwen3.5') // modelo do orquestrador carregado
    const base = makeBaseProvider()
    const swapProvider = createModelSwapProvider(base, vllm)

    const events: StreamEvent[] = []
    for await (const e of swapProvider.streamChat({
      provider: 'vllm-mlx',
      model: 'qwen3-coder-next', // modelo diferente → deve trocar
      messages: [{ role: 'user', content: 'escreva código' }],
    })) {
      events.push(e)
    }

    const types = events.map((e) => e.type)
    expect(types[0]).toBe('model_loading')
    expect(types[1]).toBe('model_ready')
    expect(vllm.swapModel).toHaveBeenCalledWith('qwen3-coder-next')
    // Após swap, currentModel deve ser o novo modelo
    expect(vllm.currentModel).toBe('qwen3-coder-next')
  })

  it('os eventos base (content, finish) vêm APÓS os eventos de swap', async () => {
    const vllm = makeVllm('qwen3.5')
    const base = makeBaseProvider()
    const swapProvider = createModelSwapProvider(base, vllm)

    const events: StreamEvent[] = []
    for await (const e of swapProvider.streamChat({
      provider: 'vllm-mlx',
      model: 'qwen3-coder-next',
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      events.push(e)
    }

    const types = events.map((e) => e.type)
    expect(types).toEqual(['model_loading', 'model_ready', 'content', 'finish'])
  })

  it('o model_loading carrega o nome do modelo correto', async () => {
    const vllm = makeVllm('qwen3.5')
    const base = makeBaseProvider()
    const swapProvider = createModelSwapProvider(base, vllm)

    const events: StreamEvent[] = []
    for await (const e of swapProvider.streamChat({
      provider: 'vllm-mlx',
      model: 'qwen3-coder-next',
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      events.push(e)
    }

    const loadingEvent = events.find((e) => e.type === 'model_loading') as
      | { type: 'model_loading'; modelName: string }
      | undefined
    const readyEvent = events.find((e) => e.type === 'model_ready') as
      | { type: 'model_ready'; modelName: string }
      | undefined
    expect(loadingEvent?.modelName).toBe('qwen3-coder-next')
    expect(readyEvent?.modelName).toBe('qwen3-coder-next')
  })

  it('swapModel é chamado na ordem correta: loading → swap → ready → base stream', async () => {
    const callOrder: string[] = []
    const vllm = makeVllm('qwen3.5')
    ;(vllm.swapModel as ReturnType<typeof vi.fn>).mockImplementation(async (model: string) => {
      callOrder.push(`swap:${model}`)
      vllm._currentModel = model
    })

    async function* trackingStream() {
      callOrder.push('base:content')
      yield { type: 'content' as const, content: 'result' }
      callOrder.push('base:finish')
      yield {
        type: 'finish' as const,
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }
    }

    const base: ProviderLayer = {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(() => []),
      streamChat: vi.fn(() => trackingStream()),
      generateText: vi.fn(),
    }

    const swapProvider = createModelSwapProvider(base, vllm)
    const events: string[] = []

    for await (const e of swapProvider.streamChat({
      provider: 'vllm-mlx',
      model: 'qwen3-coder-next',
      messages: [{ role: 'user', content: 'hello' }],
    })) {
      events.push(e.type)
    }

    // Ordem esperada de eventos na sequência correta
    expect(events).toEqual(['model_loading', 'model_ready', 'content', 'finish'])
    expect(callOrder).toEqual(['swap:qwen3-coder-next', 'base:content', 'base:finish'])
  })
})

// ── Integração com Orchestrator ───────────────────────────────────────────────

describe('Orchestrator + ModelSwapProvider — propagação de eventos', () => {
  it('propaga model_loading e model_ready emitidos pelo provider', async () => {
    // Provider que emite eventos de swap simulados (como se viessem do ModelSwapProvider)
    const swappingStream: StreamEvent[] = [
      { type: 'model_loading', modelName: 'qwen3.5' },
      { type: 'model_ready', modelName: 'qwen3.5' },
      { type: 'content', content: 'Olá!' },
      { type: 'finish', usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } },
    ]

    const deps = makeOrchestratorDeps({
      customProvider: makeBaseProvider([swappingStream]),
    })
    const orch = createOrchestrator(deps)

    const events: Array<{ type: string }> = []
    for await (const e of orch.chat('sess-1', { content: 'Oi' })) {
      events.push(e as { type: string })
    }

    const types = events.map((e) => e.type)
    expect(types).toContain('model_loading')
    expect(types).toContain('model_ready')
    expect(types).toContain('content')
    expect(types).toContain('finish')
  })

  it('eventos de swap ocorrem ANTES dos eventos content no stream do orchestrator', async () => {
    const swappingStream: StreamEvent[] = [
      { type: 'model_loading', modelName: 'qwen3.5' },
      { type: 'model_ready', modelName: 'qwen3.5' },
      { type: 'content', content: 'Resposta' },
      { type: 'finish', usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 } },
    ]

    const deps = makeOrchestratorDeps({
      customProvider: makeBaseProvider([swappingStream]),
    })
    const orch = createOrchestrator(deps)

    const events: Array<{ type: string }> = []
    for await (const e of orch.chat('sess-1', { content: 'Oi' })) {
      events.push(e as { type: string })
    }

    const types = events.map((e) => e.type)
    const loadingIdx = types.indexOf('model_loading')
    const readyIdx = types.indexOf('model_ready')
    const contentIdx = types.indexOf('content')

    expect(loadingIdx).toBeLessThan(contentIdx)
    expect(readyIdx).toBeLessThan(contentIdx)
  })
})

// ── Cenário completo: Orchestrator delega ao subagente (2b2) ─────────────────

describe('Cenário 2b2 — orchestrator solicita subagente com troca de modelo', () => {
  it('emite eventos de swap antes do subagente e retorna resposta final após swap de volta', async () => {
    // Simula: vllm começa com orchestratorModel carregado
    const vllm = makeVllm('qwen3.5')

    // Stream 1 (orquestrador): emite tool_call → solicita subagente
    const orchestratorStream1: StreamEvent[] = [
      {
        type: 'tool_call',
        id: 'tc-1',
        name: 'task',
        args: { agent: 'coder', instruction: 'Escreva uma função' },
      },
    ]
    // Stream 2 (orquestrador): após o subagente terminar, gera resposta final
    // Desta vez o swap ocorre de volta ao orchestratorModel
    const orchestratorStream2: StreamEvent[] = [
      { type: 'model_loading', modelName: 'qwen3.5' }, // swap de volta ao orquestrador
      { type: 'model_ready', modelName: 'qwen3.5' },
      { type: 'content', content: 'Aqui está o resultado da tarefa.' },
      { type: 'finish', usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 } },
    ]

    let providerCallCount = 0
    const mockBaseProvider: ProviderLayer = {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(() => []),
      streamChat: vi.fn(() => {
        const call = providerCallCount++
        if (call === 0) return makeStream(orchestratorStream1)
        return makeStream(orchestratorStream2)
      }),
      generateText: vi.fn().mockResolvedValue({ text: 'summary', usage: { totalTokens: 10 } }),
    }

    // ModelSwapProvider: antes do subagente roda, simula que o subagente
    // (com agentModel='qwen3-coder-next') causou um swap de modelo
    // Ao voltar para o orquestrador, o stream 2 emite os eventos de swap
    const effectiveProvider = createModelSwapProvider(mockBaseProvider, vllm)

    const tools = {
      register: vi.fn(),
      get: vi.fn((name: string) =>
        name === 'task'
          ? { name: 'task', description: 'Delegação', parameters: {}, level: 'orchestrator' }
          : undefined,
      ),
      list: vi.fn(() => [
        {
          name: 'task',
          description: 'Delegação de tarefas',
          parameters: {},
          level: 'orchestrator',
        },
      ]),
      has: vi.fn((name: string) => name === 'task'),
    }

    // toolDispatcher simula execução do subagente: durante a execução, troca o
    // currentModel do vllm para agentModel (qwen3-coder-next), como aconteceria
    // em produção quando o subagente chama streamChat com agentModel
    const toolDispatcher = {
      dispatch: vi.fn().mockImplementation(async () => {
        // Simula que o subagente rodou e carregou o agentModel no vllm
        vllm._currentModel = 'qwen3-coder-next'
        return { success: true, data: 'função escrita com sucesso' }
      }),
    }

    const deps = makeOrchestratorDeps({
      customProvider: effectiveProvider as unknown as OrchestratorDeps['provider'],
      toolDispatcher: toolDispatcher as unknown as OrchestratorDeps['toolDispatcher'],
      tools: tools as unknown as OrchestratorDeps['tools'],
      orchestratorModel: 'qwen3.5',
      agentModel: 'qwen3-coder-next',
    })
    const orch = createOrchestrator(deps)

    const events: Array<{ type: string; [k: string]: unknown }> = []
    for await (const e of orch.chat('sess-1', { content: 'Escreva uma função Python' })) {
      events.push(e as { type: string; [k: string]: unknown })
    }

    const types = events.map((e) => e.type)

    // 1. Deve ter emitido tool_call (orchestrator delegou ao subagente)
    expect(types).toContain('tool_call')

    // 2. Deve ter emitido subagent_start antes do resultado
    expect(types).toContain('subagent_start')

    // 3. Deve ter emitido model_loading/model_ready ao retornar ao orchestratorModel
    expect(types).toContain('model_loading')
    expect(types).toContain('model_ready')

    // 4. Deve ter emitido a resposta final do orquestrador
    expect(types).toContain('content')
    expect(types).toContain('finish')

    // 5. Os eventos de swap devem ocorrer ANTES do content final
    const swapLoadingIdx = types.lastIndexOf('model_loading')
    const swapReadyIdx = types.lastIndexOf('model_ready')
    const contentIdx = types.indexOf('content')
    expect(swapLoadingIdx).toBeLessThan(contentIdx)
    expect(swapReadyIdx).toBeLessThan(contentIdx)

    // 6. swapModel foi chamado para voltar ao modelo do orquestrador
    expect(vllm.swapModel).toHaveBeenCalledWith('qwen3.5')

    // 7. toolDispatcher foi chamado para o tool 'task'
    expect(toolDispatcher.dispatch).toHaveBeenCalledWith(
      'task',
      expect.anything(),
      expect.anything(),
    )
  })

  it('nenhum swap ocorre quando orchestratorModel e agentModel são iguais', async () => {
    // Quando os dois modelos são iguais, currentModel nunca muda → sem swap
    const vllm = makeVllm('qwen3.5')

    const baseStream: StreamEvent[] = [
      { type: 'content', content: 'Resposta direta sem swap' },
      { type: 'finish', usage: { promptTokens: 5, completionTokens: 2, totalTokens: 7 } },
    ]

    const effectiveProvider = createModelSwapProvider(makeBaseProvider([baseStream]), vllm)

    const deps = makeOrchestratorDeps({
      customProvider: effectiveProvider as unknown as OrchestratorDeps['provider'],
      orchestratorModel: 'qwen3.5',
      agentModel: 'qwen3.5', // mesmo modelo → nenhum swap
    })
    const orch = createOrchestrator(deps)

    const events: Array<{ type: string }> = []
    for await (const e of orch.chat('sess-1', { content: 'Oi' })) {
      events.push(e as { type: string })
    }

    // Sem eventos de swap
    expect(events.every((e) => e.type !== 'model_loading')).toBe(true)
    expect(events.every((e) => e.type !== 'model_ready')).toBe(true)

    // swapModel não deve ter sido chamado
    expect(vllm.swapModel).not.toHaveBeenCalled()
  })
})
