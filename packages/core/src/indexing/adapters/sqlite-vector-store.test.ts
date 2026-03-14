import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SqliteVectorStore } from './sqlite-vector-store'
import type { VectorPoint } from '../ports/vector-store.port'

describe('SqliteVectorStore', () => {
  let store: SqliteVectorStore
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'athion-vector-test-'))
    store = new SqliteVectorStore(join(tempDir, 'test.db'))
    await store.initialize()
  })

  afterEach(async () => {
    await store.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  const makePoint = (
    id: string,
    vector: number[],
    payload: Record<string, unknown> = {},
  ): VectorPoint => ({
    id,
    vector,
    payload,
  })

  describe('initialize', () => {
    it('cria tabela de vetores sem erro', async () => {
      const available = await store.isAvailable()
      expect(available).toBe(true)
    })

    it('é idempotente (pode chamar várias vezes)', async () => {
      await store.initialize()
      await store.initialize()
      expect(await store.isAvailable()).toBe(true)
    })
  })

  describe('upsertPoints', () => {
    it('insere pontos vetoriais', async () => {
      const points = [
        makePoint('p1', [1, 0, 0], { filePath: '/a.ts' }),
        makePoint('p2', [0, 1, 0], { filePath: '/b.ts' }),
      ]
      await store.upsertPoints('chunks', points)

      const results = await store.scroll('chunks', 1000).then((r) => r.points)
      expect(results).toHaveLength(2)
    })

    it('atualiza ponto existente (upsert)', async () => {
      await store.upsertPoints('chunks', [makePoint('p1', [1, 0, 0], { v: 1 })])
      await store.upsertPoints('chunks', [makePoint('p1', [0, 1, 0], { v: 2 })])

      const results = await store.scroll('chunks', 1000).then((r) => r.points)
      expect(results).toHaveLength(1)
      expect(results.at(0).payload.v).toBe(2)
    })
  })

  describe('search', () => {
    it('retorna resultados ordenados por similaridade', async () => {
      await store.upsertPoints('chunks', [
        makePoint('exact', [1, 0, 0], { name: 'exact' }),
        makePoint('similar', [0.9, 0.1, 0], { name: 'similar' }),
        makePoint('different', [0, 0, 1], { name: 'different' }),
      ])

      const results = await store.search('chunks', {
        vector: [1, 0, 0],
        limit: 3,
        scoreThreshold: 0.1,
      })

      expect(results.length).toBeGreaterThanOrEqual(2)
      expect(results.at(0).id).toBe('exact')
      expect(results.at(0).score).toBeCloseTo(1.0, 1)
    })

    it('respeita scoreThreshold', async () => {
      await store.upsertPoints('chunks', [
        makePoint('high', [1, 0, 0]),
        makePoint('low', [0, 0, 1]),
      ])

      const results = await store.search('chunks', {
        vector: [1, 0, 0],
        limit: 10,
        scoreThreshold: 0.9,
      })

      expect(results.every((r) => r.score > 0.9)).toBe(true)
    })

    it('respeita limit', async () => {
      const points = Array.from({ length: 10 }, (_, i) =>
        makePoint(`p${i}`, [Math.random(), Math.random(), Math.random()]),
      )
      await store.upsertPoints('chunks', points)

      const results = await store.search('chunks', {
        vector: [1, 0, 0],
        limit: 3,
      })

      expect(results.length).toBeLessThanOrEqual(3)
    })

    it('aplica filtro por campo do payload', async () => {
      await store.upsertPoints('chunks', [
        makePoint('ts1', [1, 0, 0], { language: 'typescript' }),
        makePoint('py1', [0.9, 0.1, 0], { language: 'python' }),
      ])

      const results = await store.search('chunks', {
        vector: [1, 0, 0],
        limit: 10,
        filter: { must: [{ key: 'language', match: { value: 'typescript' } }] },
      })

      expect(results).toHaveLength(1)
      expect(results.at(0).id).toBe('ts1')
    })
  })

  describe('deletePoints', () => {
    it('remove pontos que satisfazem o filtro', async () => {
      await store.upsertPoints('chunks', [
        makePoint('a1', [1, 0, 0], { filePath: '/a.ts' }),
        makePoint('a2', [0, 1, 0], { filePath: '/a.ts' }),
        makePoint('b1', [0, 0, 1], { filePath: '/b.ts' }),
      ])

      await store.deletePoints('chunks', {
        must: [{ key: 'filePath', match: { value: '/a.ts' } }],
      })

      const remaining = await store.scroll('chunks', 1000).then((r) => r.points)
      expect(remaining).toHaveLength(1)
      expect(remaining.at(0).id).toBe('b1')
    })

    it('não remove nada se filtro não casa', async () => {
      await store.upsertPoints('chunks', [makePoint('p1', [1, 0, 0], { x: 1 })])
      await store.deletePoints('chunks', {
        must: [{ key: 'x', match: { value: 999 } }],
      })

      const results = await store.scroll('chunks', 1000).then((r) => r.points)
      expect(results).toHaveLength(1)
    })
  })

  describe('retrieve', () => {
    it('recupera pontos por IDs', async () => {
      await store.upsertPoints('chunks', [
        makePoint('p1', [1, 0, 0]),
        makePoint('p2', [0, 1, 0]),
        makePoint('p3', [0, 0, 1]),
      ])

      const results = await store.retrieve('chunks', ['p1', 'p3'])
      expect(results).toHaveLength(2)
      expect(results.map((r) => r.id).sort()).toEqual(['p1', 'p3'])
    })

    it('retorna vazio para IDs inexistentes', async () => {
      const results = await store.retrieve('chunks', ['nonexistent'])
      expect(results).toHaveLength(0)
    })

    it('retorna vazio para array vazio de IDs', async () => {
      const results = await store.retrieve('chunks', [])
      expect(results).toHaveLength(0)
    })
  })

  describe('scroll', () => {
    it('retorna todos os pontos sem filtro', async () => {
      await store.upsertPoints('chunks', [makePoint('p1', [1, 0, 0]), makePoint('p2', [0, 1, 0])])

      const results = await store.scroll('chunks', 1000).then((r) => r.points)
      expect(results).toHaveLength(2)
    })

    it('respeita limit', async () => {
      const points = Array.from({ length: 5 }, (_, i) => makePoint(`p${i}`, [i, 0, 0]))
      await store.upsertPoints('chunks', points)

      const page = await store.scroll('chunks', 2)
      expect(page.points).toHaveLength(2)
    })
  })
})
