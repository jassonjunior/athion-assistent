import { describe, expect, it, vi } from 'vitest'
import { IndexMetrics } from './index-metrics'
import { createBus } from '../bus/bus'
import { indexingCompletedEvent, indexingFailedEvent, metricsUpdatedEvent } from './events'

describe('IndexMetrics', () => {
  it('conta filesProcessed ao receber indexing_completed', () => {
    const bus = createBus()
    const metrics = new IndexMetrics(bus)

    bus.publish(indexingCompletedEvent, { filePath: '/a.ts', durationMs: 100 })
    bus.publish(indexingCompletedEvent, { filePath: '/b.ts', durationMs: 200 })

    const snap = metrics.getSnapshot()
    expect(snap.filesProcessed).toBe(2)
    expect(snap.totalDurationMs).toBe(300)
    expect(snap.avgDurationMs).toBe(150)
    expect(snap.lastIndexedAt).not.toBeNull()

    metrics.dispose()
  })

  it('conta filesFailed ao receber indexing_failed', () => {
    const bus = createBus()
    const metrics = new IndexMetrics(bus)

    bus.publish(indexingFailedEvent, { filePath: '/c.ts', error: 'boom' })

    const snap = metrics.getSnapshot()
    expect(snap.filesFailed).toBe(1)
    expect(snap.failureRate).toBe(1) // 1/1

    metrics.dispose()
  })

  it('calcula failureRate corretamente', () => {
    const bus = createBus()
    const metrics = new IndexMetrics(bus)

    bus.publish(indexingCompletedEvent, { filePath: '/a.ts', durationMs: 50 })
    bus.publish(indexingCompletedEvent, { filePath: '/b.ts', durationMs: 50 })
    bus.publish(indexingCompletedEvent, { filePath: '/c.ts', durationMs: 50 })
    bus.publish(indexingFailedEvent, { filePath: '/d.ts', error: 'err' })

    const snap = metrics.getSnapshot()
    expect(snap.failureRate).toBe(0.25) // 1/4

    metrics.dispose()
  })

  it('reset zera todas as métricas', () => {
    const bus = createBus()
    const metrics = new IndexMetrics(bus)

    bus.publish(indexingCompletedEvent, { filePath: '/a.ts', durationMs: 100 })
    metrics.reset()

    const snap = metrics.getSnapshot()
    expect(snap.filesProcessed).toBe(0)
    expect(snap.totalDurationMs).toBe(0)
    expect(snap.lastIndexedAt).toBeNull()

    metrics.dispose()
  })

  it('getSnapshot retorna zeros quando vazio', () => {
    const bus = createBus()
    const metrics = new IndexMetrics(bus)

    const snap = metrics.getSnapshot()
    expect(snap.filesProcessed).toBe(0)
    expect(snap.filesFailed).toBe(0)
    expect(snap.avgDurationMs).toBe(0)
    expect(snap.failureRate).toBe(0)

    metrics.dispose()
  })

  it('startPeriodicEmit emite via bus', () => {
    vi.useFakeTimers()
    const bus = createBus()
    const metrics = new IndexMetrics(bus)

    const received: unknown[] = []
    bus.subscribe(metricsUpdatedEvent, (data) => received.push(data))

    metrics.startPeriodicEmit()
    vi.advanceTimersByTime(30_001)

    expect(received.length).toBe(1)

    metrics.dispose()
    vi.useRealTimers()
  })

  it('dispose para listeners e emissão periódica', () => {
    const bus = createBus()
    const metrics = new IndexMetrics(bus)
    metrics.startPeriodicEmit()

    metrics.dispose()

    // Após dispose, eventos não devem mais incrementar métricas
    bus.publish(indexingCompletedEvent, { filePath: '/x.ts', durationMs: 50 })
    const snap = metrics.getSnapshot()
    expect(snap.filesProcessed).toBe(0)
  })
})
