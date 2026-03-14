import { describe, expect, it, vi } from 'vitest'
import { createBus } from './bus'
import { FileChanged, IndexingStarted, IndexingCompleted, IndexingFailed } from './events'

describe('Codebase Indexing Events', () => {
  it('FileChanged emite e recebe evento com schema correto', () => {
    const bus = createBus()
    const handler = vi.fn()
    bus.subscribe(FileChanged, handler)

    bus.publish(FileChanged, {
      filePath: '/src/app.ts',
      event: 'change',
      timestamp: Date.now(),
    })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/src/app.ts',
        event: 'change',
      }),
    )
  })

  it('FileChanged aceita todos os tipos de evento (add, change, unlink)', () => {
    const bus = createBus()
    const handler = vi.fn()
    bus.subscribe(FileChanged, handler)

    for (const event of ['add', 'change', 'unlink'] as const) {
      bus.publish(FileChanged, { filePath: '/a.ts', event, timestamp: 0 })
    }

    expect(handler).toHaveBeenCalledTimes(3)
  })

  it('IndexingStarted emite com nível hierárquico', () => {
    const bus = createBus()
    const handler = vi.fn()
    bus.subscribe(IndexingStarted, handler)

    bus.publish(IndexingStarted, {
      filePath: '/src/module.ts',
      level: 'L3',
    })

    expect(handler).toHaveBeenCalledWith({
      filePath: '/src/module.ts',
      level: 'L3',
    })
  })

  it('IndexingStarted aceita todos os níveis (L0-L4)', () => {
    const bus = createBus()
    const handler = vi.fn()
    bus.subscribe(IndexingStarted, handler)

    for (const level of ['L0', 'L1', 'L2', 'L3', 'L4'] as const) {
      bus.publish(IndexingStarted, { filePath: '/a.ts', level })
    }

    expect(handler).toHaveBeenCalledTimes(5)
  })

  it('IndexingCompleted emite com métricas de performance', () => {
    const bus = createBus()
    const handler = vi.fn()
    bus.subscribe(IndexingCompleted, handler)

    bus.publish(IndexingCompleted, {
      filePath: '/src/utils.ts',
      chunksIndexed: 5,
      durationMs: 120,
      enriched: false,
    })

    expect(handler).toHaveBeenCalledWith({
      filePath: '/src/utils.ts',
      chunksIndexed: 5,
      durationMs: 120,
      enriched: false,
    })
  })

  it('IndexingFailed emite com informação de erro e stage', () => {
    const bus = createBus()
    const handler = vi.fn()
    bus.subscribe(IndexingFailed, handler)

    bus.publish(IndexingFailed, {
      filePath: '/src/broken.ts',
      error: 'Embedding API timeout',
      stage: 'embed',
    })

    expect(handler).toHaveBeenCalledWith({
      filePath: '/src/broken.ts',
      error: 'Embedding API timeout',
      stage: 'embed',
    })
  })

  it('eventos de indexação são independentes dos outros eventos', () => {
    const bus = createBus()
    const fileHandler = vi.fn()
    const indexHandler = vi.fn()
    bus.subscribe(FileChanged, fileHandler)
    bus.subscribe(IndexingStarted, indexHandler)

    bus.publish(FileChanged, { filePath: '/a.ts', event: 'add', timestamp: 0 })

    expect(fileHandler).toHaveBeenCalledOnce()
    expect(indexHandler).not.toHaveBeenCalled()
  })
})
