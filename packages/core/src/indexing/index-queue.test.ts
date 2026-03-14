import { describe, expect, it, vi } from 'vitest'
import { IndexQueue } from './index-queue'
import { createBus } from '../bus/bus'
import { indexingStartedEvent, indexingCompletedEvent, indexingFailedEvent } from './events'
import type { CodebaseIndexer } from './manager'

function createMockIndexer(): CodebaseIndexer {
  return {
    indexFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    searchSymbols: vi.fn().mockResolvedValue([]),
    searchFiles: vi.fn().mockResolvedValue([]),
    getContextData: vi.fn().mockReturnValue({
      repoMeta: null,
      patterns: null,
      fileSummaries: [],
      symbols: [],
    }),
    indexWorkspace: vi.fn().mockResolvedValue({}),
    getStats: vi.fn().mockReturnValue({}),
    clear: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
    needsReindex: vi.fn().mockReturnValue(false),
  } as unknown as CodebaseIndexer
}

describe('IndexQueue', () => {
  it('enqueue e processa tarefa de index', async () => {
    const bus = createBus()
    const indexer = createMockIndexer()
    const queue = new IndexQueue(indexer, bus)

    const events: string[] = []
    bus.subscribe(indexingStartedEvent, () => events.push('started'))
    bus.subscribe(indexingCompletedEvent, () => events.push('completed'))

    queue.enqueue({ filePath: '/test/file.ts', type: 'index' })

    // Aguarda processamento
    await new Promise((r) => setTimeout(r, 50))

    expect(indexer.indexFile).toHaveBeenCalledWith('/test/file.ts', true)
    expect(events).toContain('started')
    expect(events).toContain('completed')
  })

  it('enqueue e processa tarefa de delete', async () => {
    const bus = createBus()
    const indexer = createMockIndexer()
    const queue = new IndexQueue(indexer, bus)

    queue.enqueue({ filePath: '/test/file.ts', type: 'delete' })

    await new Promise((r) => setTimeout(r, 50))

    expect(indexer.deleteFile).toHaveBeenCalledWith('/test/file.ts')
  })

  it('deduplicação: mesmo arquivo substitui na fila', async () => {
    const bus = createBus()
    const indexer = createMockIndexer()
    // Bloqueia a primeira chamada para forçar fila
    let resolveFirst: (() => void) | null = null
    ;(indexer.indexFile as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          resolveFirst = r
        }),
    )

    const queue = new IndexQueue(indexer, bus, { maxConcurrency: 1 })

    queue.enqueue({ filePath: '/test/a.ts', type: 'index' }) // Processa imediatamente
    queue.enqueue({ filePath: '/test/b.ts', type: 'index' }) // Vai pra fila
    queue.enqueue({ filePath: '/test/b.ts', type: 'delete' }) // Substitui na fila

    expect(queue.pending).toBe(1) // Apenas 1 na fila (b.ts dedup)

    // Libera primeira tarefa
    resolveFirst?.()
    await new Promise((r) => setTimeout(r, 50))

    // b.ts deve ter sido chamado como delete (substituiu o index)
    expect(indexer.deleteFile).toHaveBeenCalledWith('/test/b.ts')
  })

  it('emite indexing_failed quando indexer falha', async () => {
    const bus = createBus()
    const indexer = createMockIndexer()
    ;(indexer.indexFile as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('disk full'))

    const failures: string[] = []
    bus.subscribe(indexingFailedEvent, (data) => failures.push(data.error))

    const queue = new IndexQueue(indexer, bus)
    queue.enqueue({ filePath: '/test/fail.ts', type: 'index' })

    await new Promise((r) => setTimeout(r, 50))

    expect(failures).toContain('disk full')
  })

  it('concorrência limitada respeita maxConcurrency', async () => {
    const bus = createBus()
    const indexer = createMockIndexer()
    let concurrent = 0
    let maxConcurrent = 0

    ;(indexer.indexFile as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      concurrent++
      if (concurrent > maxConcurrent) maxConcurrent = concurrent
      await new Promise((r) => setTimeout(r, 20))
      concurrent--
    })

    const queue = new IndexQueue(indexer, bus, { maxConcurrency: 2 })

    // Enqueue 5 tarefas
    for (let i = 0; i < 5; i++) {
      queue.enqueue({ filePath: `/test/file${i}.ts`, type: 'index' })
    }

    await new Promise((r) => setTimeout(r, 200))

    expect(maxConcurrent).toBeLessThanOrEqual(2)
  })

  it('pending e active retornam valores corretos', () => {
    const bus = createBus()
    const indexer = createMockIndexer()
    const queue = new IndexQueue(indexer, bus)

    expect(queue.pending).toBe(0)
    expect(queue.active).toBe(0)
  })
})
