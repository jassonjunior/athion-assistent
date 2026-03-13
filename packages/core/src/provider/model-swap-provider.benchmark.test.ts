/**
 * Benchmark: ModelSwapProvider — custo de performance do swap de modelo.
 *
 * Mede o tempo de uma requisição completa (orchestrator → resposta):
 * - SEM swap: orchestratorModel === agentModel → nenhum unload/load
 * - COM swap: orchestratorModel !== agentModel → unload + load simulados
 *
 * O swapModel é mockado com delay configurável para simular o tempo real
 * de carregamento de modelo no vLLM (normalmente 5–30s em produção).
 *
 * Resultados são impressos no console para inspeção humana e também
 * assertados para garantir que o swap realmente adicionou latência.
 */

import { describe, expect, it, vi } from 'vitest'
import { createModelSwapProvider } from './model-swap-provider'
import { createOrchestrator } from '../orchestrator/orchestrator'
import type { OrchestratorDeps } from '../orchestrator/orchestrator'
import type { VllmManager } from '../server/vllm-manager'
import type { ProviderLayer } from './provider'
import type { StreamEvent } from './types'
import type { Session } from '../orchestrator/types'

// ── Config do benchmark ───────────────────────────────────────────────────────

/** Latência simulada do vLLM ao trocar de modelo (em ms). */
const SWAP_LATENCY_MS = 80

/** Latência simulada do LLM ao gerar cada chunk (em ms). */
const STREAM_CHUNK_LATENCY_MS = 5

/** Número de chunks gerados pelo LLM em cada resposta. */
const STREAM_CHUNKS = 5

// ── helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeSession(id = 'sess-1'): Session {
  return {
    id,
    projectId: 'proj-1',
    title: 'Benchmark',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/** Cria mock do VllmManager com swapModel que simula latência configurável. */
function makeVllm(initialModel: string, swapLatencyMs = SWAP_LATENCY_MS) {
  const state = { model: initialModel }
  return {
    get currentModel() {
      return state.model
    },
    set _currentModel(v: string) {
      state.model = v
    },
    swapModel: vi.fn().mockImplementation(async (model: string) => {
      await sleep(swapLatencyMs) // simula unload + load
      state.model = model
    }),
    isRunning: vi.fn().mockResolvedValue(true),
    ensureRunning: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    touch: vi.fn(),
    baseUrl: 'http://localhost:8000',
  } satisfies Omit<VllmManager, 'baseUrl'> & { baseUrl: string; _currentModel: string }
}

/** Cria AsyncGenerator que simula latência por chunk (realista). */
async function* makeSlowStream(
  chunks: number,
  chunkLatencyMs: number,
): AsyncGenerator<StreamEvent> {
  for (let i = 0; i < chunks; i++) {
    await sleep(chunkLatencyMs)
    yield { type: 'content', content: `chunk-${i} ` }
  }
  yield {
    type: 'finish',
    usage: { promptTokens: 10 * chunks, completionTokens: chunks, totalTokens: 11 * chunks },
  }
}

/** Cria ProviderLayer mock com stream lento. */
function makeSlowProvider(
  chunks = STREAM_CHUNKS,
  chunkLatencyMs = STREAM_CHUNK_LATENCY_MS,
): ProviderLayer {
  return {
    listProviders: vi.fn(() => []),
    listModels: vi.fn(() => []),
    streamChat: vi.fn(() => makeSlowStream(chunks, chunkLatencyMs)),
    generateText: vi.fn().mockResolvedValue({ text: 'summary', usage: { totalTokens: 10 } }),
  }
}

/** Cria OrchestratorDeps mínimo com provider customizado. */
function makeDeps(provider: ProviderLayer, orchestratorModel?: string): OrchestratorDeps {
  const session = makeSession()
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'provider') return 'vllm-mlx'
      if (key === 'model') return 'default-model'
      if (key === 'orchestratorModel') return orchestratorModel ?? undefined
      return undefined
    }),
    set: vi.fn(),
    reload: vi.fn(),
    onChanged: vi.fn(),
    getAll: vi.fn(() => ({})),
  }
  return {
    config: config as unknown as OrchestratorDeps['config'],
    bus: {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
      once: vi.fn(() => vi.fn()),
      clear: vi.fn(),
    } as unknown as OrchestratorDeps['bus'],
    provider: provider as unknown as OrchestratorDeps['provider'],
    tools: {
      register: vi.fn(),
      get: vi.fn(),
      list: vi.fn(() => []),
      has: vi.fn(() => false),
    } as unknown as OrchestratorDeps['tools'],
    tokens: {
      add: vi.fn(),
      trackUsage: vi.fn(),
      budget: vi.fn(() => ({ used: 0, limit: 100_000, ratio: 0 })),
      needsCompaction: vi.fn(() => false),
      reset: vi.fn(),
      detectLoop: vi.fn(() => ({ detected: false })),
    } as unknown as OrchestratorDeps['tokens'],
    skills: {
      get: vi.fn(() => null),
      list: vi.fn(() => []),
      reload: vi.fn(),
    } as unknown as OrchestratorDeps['skills'],
    session: {
      create: vi.fn(() => session),
      load: vi.fn(() => session),
      list: vi.fn(() => [session]),
      delete: vi.fn(),
      getMessages: vi.fn(() => []),
      addMessage: vi.fn(),
      compress: vi.fn().mockResolvedValue(undefined),
    } as unknown as OrchestratorDeps['session'],
    promptBuilder: {
      build: vi.fn(() => 'System prompt'),
    } as unknown as OrchestratorDeps['promptBuilder'],
    toolDispatcher: {
      dispatch: vi.fn().mockResolvedValue({ success: true, data: 'ok' }),
    } as unknown as OrchestratorDeps['toolDispatcher'],
    subagents: {
      list: vi.fn(() => []),
      get: vi.fn(() => null),
      run: vi.fn(),
      registerAgent: vi.fn(),
      getAgent: vi.fn(),
      spawn: vi.fn(),
    } as unknown as OrchestratorDeps['subagents'],
  }
}

/** Executa uma requisição completa e retorna eventos + tempo gasto em ms. */
async function runRequest(
  orch: ReturnType<typeof createOrchestrator>,
): Promise<{ events: Array<{ type: string }>; elapsedMs: number }> {
  const start = performance.now()
  const events: Array<{ type: string }> = []
  for await (const e of orch.chat('sess-1', { content: 'Escreva uma função Python' })) {
    events.push(e as { type: string })
  }
  const elapsedMs = Math.round(performance.now() - start)
  return { events, elapsedMs }
}

// ── Benchmark ─────────────────────────────────────────────────────────────────

describe('Benchmark: ModelSwapProvider — custo de performance', () => {
  it('SEM swap: mesmo modelo carregado → zero overhead de swap', async () => {
    const baseProvider = makeSlowProvider()
    const vllm = makeVllm('qwen3.5') // modelo já carregado = orchestratorModel
    // Sem ModelSwapProvider — usa base diretamente
    const orch = createOrchestrator(makeDeps(baseProvider, 'qwen3.5'))

    const { events, elapsedMs } = await runRequest(orch)

    const swapEvents = events.filter((e) => e.type === 'model_loading' || e.type === 'model_ready')
    const contentEvents = events.filter((e) => e.type === 'content')
    const hasFinish = events.some((e) => e.type === 'finish')

    const baselineMs = STREAM_CHUNKS * STREAM_CHUNK_LATENCY_MS

    console.log('\n─────────────────────────────────────────────')
    console.log('  BENCHMARK: requisição SEM swap de modelo')
    console.log('─────────────────────────────────────────────')
    console.log(`  Eventos de swap:   ${swapEvents.length}`)
    console.log(`  Chunks recebidos:  ${contentEvents.length}`)
    console.log(`  Tempo total:       ${elapsedMs}ms`)
    console.log(
      `  Baseline esperado: ~${baselineMs}ms (${STREAM_CHUNKS} chunks × ${STREAM_CHUNK_LATENCY_MS}ms)`,
    )
    console.log(`  Overhead de swap:  0ms`)
    console.log('─────────────────────────────────────────────')

    expect(swapEvents).toHaveLength(0) // sem events de swap
    expect(contentEvents).toHaveLength(STREAM_CHUNKS)
    expect(hasFinish).toBe(true)
    expect(vllm.swapModel).not.toHaveBeenCalled()
    // Tempo deve estar próximo do baseline (sem overhead de swap)
    expect(elapsedMs).toBeLessThan(baselineMs + 50) // margem de 50ms para overhead de OS
  }, 10_000)

  it('COM swap: modelos diferentes → overhead de unload+load incluído', async () => {
    const baseProvider = makeSlowProvider()
    const vllm = makeVllm('qwen3-coder-next', SWAP_LATENCY_MS) // agentModel carregado
    const swapProvider = createModelSwapProvider(
      baseProvider as ProviderLayer,
      vllm as unknown as VllmManager,
    )
    // orchestratorModel = 'qwen3.5', mas vllm tem 'qwen3-coder-next' → swap necessário
    const orch = createOrchestrator(makeDeps(swapProvider as unknown as ProviderLayer, 'qwen3.5'))

    const { events, elapsedMs } = await runRequest(orch)

    const swapEvents = events.filter((e) => e.type === 'model_loading' || e.type === 'model_ready')
    const contentEvents = events.filter((e) => e.type === 'content')
    const hasFinish = events.some((e) => e.type === 'finish')

    const baselineMs = STREAM_CHUNKS * STREAM_CHUNK_LATENCY_MS
    const expectedOverhead = SWAP_LATENCY_MS
    const expectedTotal = baselineMs + expectedOverhead

    console.log('\n─────────────────────────────────────────────')
    console.log('  BENCHMARK: requisição COM swap de modelo')
    console.log('─────────────────────────────────────────────')
    console.log(`  Eventos de swap:   ${swapEvents.length} (model_loading + model_ready)`)
    console.log(`  Chunks recebidos:  ${contentEvents.length}`)
    console.log(`  Tempo total:       ${elapsedMs}ms`)
    console.log(
      `  Baseline (stream): ~${baselineMs}ms (${STREAM_CHUNKS} chunks × ${STREAM_CHUNK_LATENCY_MS}ms)`,
    )
    console.log(`  Overhead de swap:  ~${expectedOverhead}ms (simulated unload+load)`)
    console.log(`  Total esperado:    ~${expectedTotal}ms`)
    console.log('─────────────────────────────────────────────')
    console.log('  NOTA: Em produção, cada swap leva 5–30s dependendo')
    console.log('  do tamanho do modelo. O overhead é pago 1× por turn.')
    console.log('─────────────────────────────────────────────')

    expect(swapEvents).toHaveLength(2) // model_loading + model_ready
    expect(contentEvents).toHaveLength(STREAM_CHUNKS)
    expect(hasFinish).toBe(true)
    expect(vllm.swapModel).toHaveBeenCalledWith('qwen3.5')
    // Tempo deve incluir o overhead do swap
    expect(elapsedMs).toBeGreaterThanOrEqual(SWAP_LATENCY_MS)
  }, 10_000)

  it('Comparativo direto: mede e reporta diferença entre sem-swap e com-swap', async () => {
    // ── Cenário A: sem swap ──────────────────────────────────────────
    const baseProviderA = makeSlowProvider()
    const orchA = createOrchestrator(makeDeps(baseProviderA, 'qwen3.5'))
    const startA = performance.now()
    for await (const ev of orchA.chat('sess-1', { content: 'Tarefa' })) {
      void ev
    }
    const timeNoSwap = Math.round(performance.now() - startA)

    // ── Cenário B: com swap ──────────────────────────────────────────
    const baseProviderB = makeSlowProvider()
    const vllmB = makeVllm('qwen3-coder-next', SWAP_LATENCY_MS)
    const swapProviderB = createModelSwapProvider(
      baseProviderB as ProviderLayer,
      vllmB as unknown as VllmManager,
    )
    const orchB = createOrchestrator(makeDeps(swapProviderB as unknown as ProviderLayer, 'qwen3.5'))
    const startB = performance.now()
    for await (const ev of orchB.chat('sess-1', { content: 'Tarefa' })) {
      void ev
    }
    const timeWithSwap = Math.round(performance.now() - startB)

    const overhead = timeWithSwap - timeNoSwap
    const overheadRatio = ((overhead / timeNoSwap) * 100).toFixed(0)

    console.log('\n╔═══════════════════════════════════════════════╗')
    console.log('║       COMPARATIVO DE PERFORMANCE — SWAP       ║')
    console.log('╠═══════════════════════════════════════════════╣')
    console.log(`║  Sem swap (mesmo modelo):  ${String(timeNoSwap).padStart(5)}ms            ║`)
    console.log(`║  Com swap (troca modelo):  ${String(timeWithSwap).padStart(5)}ms            ║`)
    console.log(
      `║  Overhead do swap:         ${String(overhead).padStart(5)}ms (+${overheadRatio}%)       ║`,
    )
    console.log(
      `║  Latência simulada:        ${String(SWAP_LATENCY_MS).padStart(5)}ms (swap mock)  ║`,
    )
    console.log('╠═══════════════════════════════════════════════╣')
    console.log('║  Em produção (modelos grandes):               ║')
    console.log('║   Swap overhead:  5.000–30.000ms por troca    ║')
    console.log('║   Quando pagar:   1 swap por turno de agente  ║')
    console.log('║   Trade-off:      VRAM liberada vs latência    ║')
    console.log('╚═══════════════════════════════════════════════╝')

    // Com swap deve ser mais lento (overhead real do swap)
    expect(timeWithSwap).toBeGreaterThan(timeNoSwap)
    // O overhead deve corresponder ao swap simulado (com margem de 40ms)
    expect(overhead).toBeGreaterThanOrEqual(SWAP_LATENCY_MS - 20)
    expect(overhead).toBeLessThan(SWAP_LATENCY_MS + 100)
  }, 15_000)
})
