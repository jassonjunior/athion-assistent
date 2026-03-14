/** vector-store.contract.test
 * Descrição: Testes de contrato que validam qualquer implementação de VectorStorePort.
 * Roda contra SqliteVectorStore sempre. Qdrant só roda se QDRANT_URL definida.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { SqliteVectorStore } from './sqlite-vector-store'
import type { VectorStorePort, VectorPoint } from '../ports/vector-store.port'
import { tmpdir } from 'os'
import { join } from 'path'
import { unlinkSync } from 'fs'

function createTestPoints(): VectorPoint[] {
  return [
    { id: 'p1', vector: [1.0, 0.0, 0.0], payload: { filePath: '/a.ts', type: 'function' } },
    { id: 'p2', vector: [0.0, 1.0, 0.0], payload: { filePath: '/b.ts', type: 'class' } },
    { id: 'p3', vector: [0.0, 0.0, 1.0], payload: { filePath: '/a.ts', type: 'function' } },
  ]
}

function runContractTests(
  name: string,
  createStore: () => Promise<{ store: VectorStorePort; cleanup: () => void }>,
) {
  describe(`VectorStorePort contract: ${name}`, () => {
    let store: VectorStorePort
    let cleanup: () => void

    afterEach(async () => {
      await store.close()
      cleanup()
    })

    it('upsert → retrieve → verifica payload', async () => {
      const ctx = await createStore()
      store = ctx.store
      cleanup = ctx.cleanup
      await store.initialize()

      const points = createTestPoints()
      await store.upsertPoints('test', points)

      const retrieved = await store.retrieve('test', ['p1', 'p2'])
      expect(retrieved).toHaveLength(2)
      const p1 = retrieved.find((p) => p.id === 'p1')
      expect(p1).toBeDefined()
      expect(p1?.payload.filePath).toBe('/a.ts')
    })

    it('upsert → search → ordering por score', async () => {
      const ctx = await createStore()
      store = ctx.store
      cleanup = ctx.cleanup
      await store.initialize()

      await store.upsertPoints('test', createTestPoints())

      const results = await store.search('test', {
        vector: [1.0, 0.0, 0.0],
        limit: 3,
      })
      expect(results.length).toBeGreaterThan(0)
      // p1 deve ter o maior score (vetor idêntico)
      expect(results.at(0)?.id).toBe('p1')
      // Scores devem estar em ordem decrescente
      for (let i = 1; i < results.length; i++) {
        const prev = results[i - 1]
        const curr = results[i]
        if (prev && curr) {
          expect(prev.score).toBeGreaterThanOrEqual(curr.score)
        }
      }
    })

    it('upsert → delete → verifica remoção', async () => {
      const ctx = await createStore()
      store = ctx.store
      cleanup = ctx.cleanup
      await store.initialize()

      await store.upsertPoints('test', createTestPoints())
      await store.deletePoints('test', {
        must: [{ key: 'filePath', match: { value: '/a.ts' } }],
      })

      const remaining = await store.retrieve('test', ['p1', 'p2', 'p3'])
      const ids = remaining.map((p) => p.id)
      expect(ids).not.toContain('p1')
      expect(ids).toContain('p2')
      expect(ids).not.toContain('p3')
    })

    it('upsert mesmo ID 2x → update (não duplica)', async () => {
      const ctx = await createStore()
      store = ctx.store
      cleanup = ctx.cleanup
      await store.initialize()

      await store.upsertPoints('test', [{ id: 'dup', vector: [1, 0, 0], payload: { v: 1 } }])
      await store.upsertPoints('test', [{ id: 'dup', vector: [0, 1, 0], payload: { v: 2 } }])

      const retrieved = await store.retrieve('test', ['dup'])
      expect(retrieved).toHaveLength(1)
      expect(retrieved.at(0)?.payload.v).toBe(2)
    })

    it('search em coleção vazia → array vazio', async () => {
      const ctx = await createStore()
      store = ctx.store
      cleanup = ctx.cleanup
      await store.initialize()

      const results = await store.search('empty_col', {
        vector: [1, 0, 0],
        limit: 5,
      })
      expect(results).toEqual([])
    })

    it('scroll retorna pontos com paginação', async () => {
      const ctx = await createStore()
      store = ctx.store
      cleanup = ctx.cleanup
      await store.initialize()

      await store.upsertPoints('test', createTestPoints())

      const page1 = await store.scroll('test', 2)
      expect(page1.points.length).toBeLessThanOrEqual(2)
    })
  })
}

// Roda contra SQLite sempre
runContractTests('SqliteVectorStore', async () => {
  const dbPath = join(
    tmpdir(),
    `contract-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  )
  const store = new SqliteVectorStore(dbPath)
  return {
    store,
    cleanup: () => {
      try {
        unlinkSync(dbPath)
      } catch {
        // ignore
      }
    },
  }
})

// Roda contra Qdrant se QDRANT_URL definida
if (process.env.QDRANT_URL) {
  // Dynamic import para evitar erro se não tiver Qdrant
  const { QdrantVectorStore } = await import('./qdrant-vector-store')
  runContractTests('QdrantVectorStore', async () => {
    const store = new QdrantVectorStore({
      url: process.env.QDRANT_URL,
      vectorSize: 3,
    })
    return {
      store,
      cleanup: () => {},
    }
  })
}
