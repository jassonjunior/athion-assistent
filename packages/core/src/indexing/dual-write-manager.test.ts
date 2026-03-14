import { describe, expect, it, vi } from 'vitest'
import { DualWriteManager } from './dual-write-manager'
import type { VectorStorePort, VectorPoint } from './ports/vector-store.port'

function createMockStore(available = true): VectorStorePort {
  return {
    initialize: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(available),
    upsertPoints: vi.fn(),
    deletePoints: vi.fn(),
    search: vi.fn().mockResolvedValue([]),
    retrieve: vi.fn().mockResolvedValue([]),
    scroll: vi.fn().mockResolvedValue({ points: [], nextOffset: undefined }),
    close: vi.fn(),
  }
}

describe('DualWriteManager', () => {
  it('escreve no source primeiro, depois no target', async () => {
    const source = createMockStore()
    const target = createMockStore()
    const manager = new DualWriteManager(source, target)

    const points: VectorPoint[] = [{ id: 'p1', vector: [1, 0], payload: {} }]
    await manager.write('test', points)

    expect(source.upsertPoints).toHaveBeenCalledWith('test', points)
    expect(target.upsertPoints).toHaveBeenCalledWith('test', points)
  })

  it('incrementa drift quando target falha', async () => {
    const source = createMockStore()
    const target = createMockStore()
    ;(target.upsertPoints as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('down'))

    const onDrift = vi.fn()
    const manager = new DualWriteManager(source, target, onDrift)

    await manager.write('test', [{ id: 'p1', vector: [1], payload: {} }])

    expect(manager.getDriftCount()).toBe(1)
    expect(onDrift).toHaveBeenCalledWith('test', 'down')
  })

  it('não escreve no target se indisponível', async () => {
    const source = createMockStore()
    const target = createMockStore(false)
    const manager = new DualWriteManager(source, target)

    await manager.write('test', [{ id: 'p1', vector: [1], payload: {} }])

    expect(source.upsertPoints).toHaveBeenCalled()
    expect(target.upsertPoints).not.toHaveBeenCalled()
  })

  it('reconcile transfere dados do source para target', async () => {
    const source = createMockStore()
    const target = createMockStore()

    const points: VectorPoint[] = [
      { id: 'p1', vector: [1, 0], payload: { a: 1 } },
      { id: 'p2', vector: [0, 1], payload: { a: 2 } },
    ]
    ;(source.scroll as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      points,
      nextOffset: undefined,
    })

    const manager = new DualWriteManager(source, target)
    const count = await manager.reconcile('test')

    expect(count).toBe(2)
    expect(target.upsertPoints).toHaveBeenCalledWith('test', points)
  })

  it('reconcile retorna 0 se target indisponível', async () => {
    const source = createMockStore()
    const target = createMockStore(false)
    const manager = new DualWriteManager(source, target)

    const count = await manager.reconcile('test')
    expect(count).toBe(0)
  })

  it('reconcileAll reconcilia todas as coleções', async () => {
    const source = createMockStore()
    const target = createMockStore()
    ;(source.scroll as ReturnType<typeof vi.fn>).mockResolvedValue({
      points: [],
      nextOffset: undefined,
    })

    const manager = new DualWriteManager(source, target)
    const results = await manager.reconcileAll()

    expect(results.size).toBe(5)
    expect(results.get('symbols')).toBe(0)
    expect(results.get('repo_meta')).toBe(0)
  })

  it('resetDriftCount zera o contador', async () => {
    const source = createMockStore()
    const target = createMockStore()
    ;(target.upsertPoints as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('down'))

    const manager = new DualWriteManager(source, target)
    await manager.write('test', [{ id: 'p1', vector: [1], payload: {} }])
    expect(manager.getDriftCount()).toBe(1)

    manager.resetDriftCount()
    expect(manager.getDriftCount()).toBe(0)
  })
})
