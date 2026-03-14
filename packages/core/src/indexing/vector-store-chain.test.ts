import { describe, expect, it, vi } from 'vitest'
import { VectorStoreChain } from './vector-store-chain'
import type { VectorStorePort, VectorPoint } from './ports/vector-store.port'

function createMockStore(available = true): VectorStorePort {
  const points = new Map<string, VectorPoint>()
  return {
    initialize: vi.fn(),
    isAvailable: vi.fn().mockResolvedValue(available),
    upsertPoints: vi.fn().mockImplementation(async (_col: string, pts: VectorPoint[]) => {
      for (const p of pts) points.set(p.id, p)
    }),
    deletePoints: vi.fn(),
    search: vi.fn().mockResolvedValue([{ id: 'r1', score: 0.9, payload: {} }]),
    retrieve: vi.fn().mockResolvedValue([]),
    scroll: vi.fn().mockResolvedValue({ points: [], nextOffset: undefined }),
    close: vi.fn(),
  }
}

describe('VectorStoreChain', () => {
  it('usa primary quando disponível', async () => {
    const primary = createMockStore(true)
    const fallback = createMockStore(true)
    const chain = new VectorStoreChain(primary, fallback)
    await chain.initialize()

    const results = await chain.search('test', { vector: [1, 0, 0], limit: 5 })
    expect(results).toHaveLength(1)
    expect(primary.search).toHaveBeenCalled()
    expect(fallback.search).not.toHaveBeenCalled()
  })

  it('fallback quando primary indisponível', async () => {
    const primary = createMockStore(false)
    const fallback = createMockStore(true)
    const chain = new VectorStoreChain(primary, fallback)
    await chain.initialize()

    expect(chain.activeStoreName).toBe('fallback')
    await chain.search('test', { vector: [1, 0, 0], limit: 5 })
    expect(fallback.search).toHaveBeenCalled()
  })

  it('fallback quando primary falha no search', async () => {
    const primary = createMockStore(true)
    ;(primary.search as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('timeout'))
    const fallback = createMockStore(true)
    const chain = new VectorStoreChain(primary, fallback)
    await chain.initialize()

    const results = await chain.search('test', { vector: [1, 0, 0], limit: 5 })
    expect(results).toHaveLength(1) // fallback respondeu
    expect(fallback.search).toHaveBeenCalled()
  })

  it('upsert escreve em ambos', async () => {
    const primary = createMockStore(true)
    const fallback = createMockStore(true)
    const chain = new VectorStoreChain(primary, fallback)
    await chain.initialize()

    const points: VectorPoint[] = [{ id: 'p1', vector: [1, 0], payload: {} }]
    await chain.upsertPoints('test', points)

    expect(fallback.upsertPoints).toHaveBeenCalledWith('test', points)
    expect(primary.upsertPoints).toHaveBeenCalledWith('test', points)
  })

  it('upsert continua mesmo se primary falha', async () => {
    const primary = createMockStore(true)
    ;(primary.upsertPoints as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('down'))
    const fallback = createMockStore(true)
    const chain = new VectorStoreChain(primary, fallback)
    await chain.initialize()

    const points: VectorPoint[] = [{ id: 'p1', vector: [1, 0], payload: {} }]
    await chain.upsertPoints('test', points)

    expect(fallback.upsertPoints).toHaveBeenCalled()
    // Não deve ter lançado exceção
  })

  it('isAvailable sempre retorna true (fallback garante)', async () => {
    const primary = createMockStore(false)
    const fallback = createMockStore(true)
    const chain = new VectorStoreChain(primary, fallback)
    await chain.initialize()

    expect(await chain.isAvailable()).toBe(true)
  })

  it('close fecha ambos os stores', async () => {
    const primary = createMockStore(true)
    const fallback = createMockStore(true)
    const chain = new VectorStoreChain(primary, fallback)

    await chain.close()
    expect(primary.close).toHaveBeenCalled()
    expect(fallback.close).toHaveBeenCalled()
  })
})
