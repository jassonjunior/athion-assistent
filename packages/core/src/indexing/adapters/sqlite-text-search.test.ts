import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { SqliteTextSearch } from './sqlite-text-search'

describe('SqliteTextSearch', () => {
  let store: SqliteTextSearch
  let tempDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'athion-fts-test-'))
    store = new SqliteTextSearch(join(tempDir, 'test.db'))
    await store.initialize()
  })

  afterEach(async () => {
    await store.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  describe('initialize', () => {
    it('cria tabela FTS5 sem erro', async () => {
      // Se chegou aqui sem exceção, a inicialização funcionou
      expect(true).toBe(true)
    })

    it('é idempotente', async () => {
      await store.initialize()
      await store.initialize()
      expect(true).toBe(true)
    })
  })

  describe('indexDocument', () => {
    it('indexa um documento para busca', async () => {
      await store.indexDocument({
        id: 'chunk-1',
        content: 'function calculateTotal(items) { return items.reduce((s, i) => s + i.price, 0) }',
        symbolName: 'calculateTotal',
        filePath: '/src/utils.ts',
        language: 'typescript',
      })

      const results = await store.search('calculateTotal')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.at(0).id).toBe('chunk-1')
    })

    it('atualiza documento existente (upsert)', async () => {
      await store.indexDocument({
        id: 'chunk-1',
        content: 'original content',
        filePath: '/a.ts',
        language: 'typescript',
      })

      await store.indexDocument({
        id: 'chunk-1',
        content: 'updated content with new keywords',
        filePath: '/a.ts',
        language: 'typescript',
      })

      const results = await store.search('updated')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.at(0).id).toBe('chunk-1')
    })
  })

  describe('search', () => {
    beforeEach(async () => {
      await store.indexDocument({
        id: 'c1',
        content:
          'export function fetchUserData(userId: string) { return api.get(`/users/${userId}`) }',
        symbolName: 'fetchUserData',
        filePath: '/src/api.ts',
        language: 'typescript',
      })
      await store.indexDocument({
        id: 'c2',
        content: 'export class DatabaseConnection { constructor(private url: string) {} }',
        symbolName: 'DatabaseConnection',
        filePath: '/src/db.ts',
        language: 'typescript',
      })
      await store.indexDocument({
        id: 'c3',
        content: 'def process_data(items): return [transform(i) for i in items]',
        symbolName: 'process_data',
        filePath: '/src/processor.py',
        language: 'python',
      })
    })

    it('encontra por conteúdo do código', async () => {
      const results = await store.search('fetchUserData')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.at(0).filePath).toBe('/src/api.ts')
    })

    it('encontra por nome de símbolo', async () => {
      const results = await store.search('DatabaseConnection')
      expect(results.length).toBeGreaterThanOrEqual(1)
      expect(results.at(0).id).toBe('c2')
    })

    it('respeita limit', async () => {
      const results = await store.search('export', 1)
      expect(results).toHaveLength(1)
    })

    it('retorna score entre 0 e 1', async () => {
      const results = await store.search('function')
      for (const r of results) {
        expect(r.score).toBeGreaterThanOrEqual(0)
        expect(r.score).toBeLessThanOrEqual(1)
      }
    })

    it('retorna vazio para query sem resultados', async () => {
      const results = await store.search('xyznonexistent123')
      expect(results).toHaveLength(0)
    })

    it('lida com caracteres especiais sem erro', async () => {
      const results = await store.search('func()"\'*')
      // Não deve lançar erro, apenas retornar resultados ou vazio
      expect(Array.isArray(results)).toBe(true)
    })

    it('busca com múltiplas palavras usa OR', async () => {
      const results = await store.search('fetch database')
      // Deve encontrar ambos os documentos que contêm uma das palavras
      expect(results.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('removeDocuments', () => {
    beforeEach(async () => {
      await store.indexDocument({
        id: 'c1',
        content: 'content one',
        filePath: '/src/a.ts',
        language: 'typescript',
      })
      await store.indexDocument({
        id: 'c2',
        content: 'content two',
        filePath: '/src/a.ts',
        language: 'typescript',
      })
      await store.indexDocument({
        id: 'c3',
        content: 'content three',
        filePath: '/src/b.ts',
        language: 'typescript',
      })
    })

    it('remove por filePath', async () => {
      await store.removeDocuments({ filePath: '/src/a.ts' })

      // c1 e c2 foram removidos, c3 permanece
      const results = await store.search('content')
      expect(results).toHaveLength(1)
      expect(results.at(0).id).toBe('c3')
    })

    it('remove por IDs', async () => {
      await store.removeDocuments({ ids: ['c1', 'c3'] })

      const results = await store.search('content')
      expect(results).toHaveLength(1)
      expect(results.at(0).id).toBe('c2')
    })

    it('não remove nada se filtro vazio', async () => {
      await store.removeDocuments({})

      const results = await store.search('content')
      expect(results).toHaveLength(3)
    })
  })
})
