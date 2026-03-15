/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-invalid-void-type */
/**
 * Testes unitários para hooks/useIndexingProgress.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks do React ────────────────────────────────────────────────

let stateValue: unknown = null
const mockSetState = vi.fn((v: unknown) => {
  stateValue = typeof v === 'function' ? (v as Function)(stateValue) : v
})

let effectCleanup: (() => void) | undefined

vi.mock('react', () => ({
  useState: (init: unknown) => {
    const val = typeof init === 'function' ? (init as () => unknown)() : init
    if (stateValue === null) stateValue = val
    return [stateValue, mockSetState]
  },
  useEffect: (fn: () => (() => void) | void) => {
    const cleanup = fn()
    if (typeof cleanup === 'function') effectCleanup = cleanup
  },
}))

vi.mock('@athion/core', () => ({
  indexingProgressEvent: 'indexing:progress',
}))

import { useIndexingProgress } from './useIndexingProgress.js'

describe('useIndexingProgress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateValue = null
    effectCleanup = undefined
  })

  it('retorna percent: -1, done: true quando não há indexer', () => {
    const core = {
      indexer: null,
      indexingProgress: undefined,
      bus: { subscribe: vi.fn() },
    }

    const result = useIndexingProgress(core as never)
    expect(result).toEqual({ percent: -1, done: true, indexing: false })
  })

  it('retorna percent: 0, done: false quando há indexer mas sem progresso prévio', () => {
    const core = {
      indexer: {},
      indexingProgress: undefined,
      bus: { subscribe: vi.fn(() => vi.fn()) },
    }

    const result = useIndexingProgress(core as never)
    expect(result).toEqual({ percent: 0, done: false, indexing: false })
  })

  it('retorna estado inicial do core.indexingProgress se disponível', () => {
    const core = {
      indexer: {},
      indexingProgress: { percent: 50, done: false },
      bus: { subscribe: vi.fn(() => vi.fn()) },
    }

    const result = useIndexingProgress(core as never)
    expect(result.percent).toBe(50)
    expect(result.done).toBe(false)
    expect(result.indexing).toBe(true)
  })

  it('retorna done: true quando indexingProgress.done é true', () => {
    const core = {
      indexer: {},
      indexingProgress: { percent: 100, done: true },
      bus: { subscribe: vi.fn(() => vi.fn()) },
    }

    const result = useIndexingProgress(core as never)
    expect(result.done).toBe(true)
    expect(result.indexing).toBe(false)
  })

  it('se inscreve no bus quando há indexer', () => {
    const unsubscribe = vi.fn()
    const core = {
      indexer: {},
      indexingProgress: undefined,
      bus: { subscribe: vi.fn(() => unsubscribe) },
    }

    useIndexingProgress(core as never)
    expect(core.bus.subscribe).toHaveBeenCalledWith('indexing:progress', expect.any(Function))
  })

  it('não se inscreve no bus quando não há indexer', () => {
    const core = {
      indexer: null,
      indexingProgress: undefined,
      bus: { subscribe: vi.fn() },
    }

    useIndexingProgress(core as never)
    expect(core.bus.subscribe).not.toHaveBeenCalled()
  })

  it('retorna unsubscribe como cleanup do useEffect', () => {
    const unsubscribe = vi.fn()
    const core = {
      indexer: {},
      indexingProgress: undefined,
      bus: { subscribe: vi.fn(() => unsubscribe) },
    }

    useIndexingProgress(core as never)
    expect(effectCleanup).toBeDefined()
    effectCleanup!()
    // O unsubscribe retornado pelo subscribe é o cleanup
  })

  it('callback do bus atualiza o estado', () => {
    let busCallback: ((data: { percent: number; done: boolean }) => void) | null = null
    const core = {
      indexer: {},
      indexingProgress: undefined,
      bus: {
        subscribe: vi.fn((_event: string, cb: typeof busCallback) => {
          busCallback = cb
          return vi.fn()
        }),
      },
    }

    useIndexingProgress(core as never)

    // Simula evento do bus
    busCallback!({ percent: 75, done: false })
    expect(mockSetState).toHaveBeenCalledWith({
      percent: 75,
      done: false,
      indexing: true,
    })
  })

  it('callback do bus com done=true seta indexing=false', () => {
    let busCallback: ((data: { percent: number; done: boolean }) => void) | null = null
    const core = {
      indexer: {},
      indexingProgress: undefined,
      bus: {
        subscribe: vi.fn((_event: string, cb: typeof busCallback) => {
          busCallback = cb
          return vi.fn()
        }),
      },
    }

    useIndexingProgress(core as never)

    busCallback!({ percent: 100, done: true })
    expect(mockSetState).toHaveBeenCalledWith({
      percent: 100,
      done: true,
      indexing: false,
    })
  })
})
