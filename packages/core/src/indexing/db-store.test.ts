/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unused-vars */
import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * DbStore depende de bun:sqlite que só funciona no Bun runtime.
 * Para vitest (Node), mockamos bun:sqlite com um Database falso
 * que delega a um Map em memória. Testamos que os métodos públicos
 * do DbStore chamam o db.run/query com os parâmetros esperados
 * e produzem o resultado correto.
 */

// Armazena dados simulados para cada instância
let mockRunCalls: Array<{ sql: string; params: unknown[] }> = []
let mockQueryReturnMap: Map<string, { allResult: unknown[]; getResult: unknown }> = new Map()

function resetMockState() {
  mockRunCalls = []
  mockQueryReturnMap = new Map()
}

function setQueryReturn(sqlPattern: string, opts: { allResult?: unknown[]; getResult?: unknown }) {
  mockQueryReturnMap.set(sqlPattern, {
    allResult: opts.allResult ?? [],
    getResult: opts.getResult ?? null,
  })
}

function findQueryReturn(sql: string): { allResult: unknown[]; getResult: unknown } {
  const sqlLower = sql.toLowerCase()
  for (const [pattern, result] of mockQueryReturnMap) {
    if (sqlLower.includes(pattern.toLowerCase())) return result
  }
  return { allResult: [], getResult: null }
}

vi.mock('bun:sqlite', () => ({
  Database: vi.fn().mockImplementation(() => ({
    run: vi.fn((sql: string, params?: unknown[]) => {
      mockRunCalls.push({ sql: sql.trim(), params: params ?? [] })
    }),
    query: vi.fn((sql: string) => {
      return {
        all: (...params: unknown[]) => {
          const result = findQueryReturn(sql)
          return result.allResult
        },
        get: (...params: unknown[]) => {
          const result = findQueryReturn(sql)
          return result.getResult
        },
      }
    }),
    close: vi.fn(),
  })),
}))

// Importa após mock
const { DbStore } = await import('./db-store')

describe('DbStore', () => {
  let store: InstanceType<typeof DbStore>

  beforeEach(() => {
    resetMockState()
    store = new DbStore(':memory:')
    // Limpa run calls do constructor (PRAGMA, CREATE TABLE, ALTER TABLE)
    mockRunCalls = []
  })

  describe('constructor', () => {
    it('cria instância sem erro', () => {
      expect(store).toBeDefined()
    })
  })

  describe('upsertChunk', () => {
    it('executa INSERT OR REPLACE INTO chunks e atualiza FTS', () => {
      store.upsertChunk({
        id: 'c1',
        filePath: '/src/a.ts',
        language: 'typescript',
        startLine: 0,
        endLine: 10,
        content: 'code here',
        chunkType: 'function',
        symbolName: 'myFunc',
      })

      // Deve ter 3 calls: DELETE FTS, INSERT chunks, INSERT FTS
      const chunkInsert = mockRunCalls.find((c) => c.sql.includes('INSERT OR REPLACE INTO chunks'))
      expect(chunkInsert).toBeDefined()
      expect(chunkInsert!.params[0]).toBe('c1')
      expect(chunkInsert!.params[1]).toBe('/src/a.ts')
      expect(chunkInsert!.params[5]).toBe('code here')

      const ftsInsert = mockRunCalls.find((c) => c.sql.includes('INSERT INTO chunks_fts'))
      expect(ftsInsert).toBeDefined()
      expect(ftsInsert!.params[0]).toBe('c1')
    })

    it('passa null para symbolName quando ausente', () => {
      store.upsertChunk({
        id: 'c1',
        filePath: '/a.ts',
        language: 'typescript',
        startLine: 0,
        endLine: 5,
        content: 'code',
        chunkType: 'block',
      })

      const insert = mockRunCalls.find((c) => c.sql.includes('INSERT OR REPLACE INTO chunks'))
      expect(insert!.params[6]).toBeNull() // symbolName
    })
  })

  describe('upsertVector', () => {
    it('executa INSERT OR REPLACE INTO vectors', () => {
      const buf = Buffer.from([1, 2, 3])
      store.upsertVector('c1', buf)

      const insert = mockRunCalls.find((c) => c.sql.includes('INSERT OR REPLACE INTO vectors'))
      expect(insert).toBeDefined()
      expect(insert!.params[0]).toBe('c1')
      expect(insert!.params[1]).toBe(buf)
    })
  })

  describe('deleteByFile', () => {
    it('consulta chunks do arquivo e deleta de FTS e chunks', () => {
      // Configura retorno do query para chunks do arquivo
      setQueryReturn('SELECT id FROM chunks WHERE file_path', {
        allResult: [{ id: 'c1' }, { id: 'c2' }],
      })

      store.deleteByFile('/src/a.ts')

      // Deve ter deletado 2 FTS entries + 1 DELETE FROM chunks
      const ftsDeletes = mockRunCalls.filter(
        (c) => c.sql.includes('DELETE FROM chunks_fts') && c.params[0] !== undefined,
      )
      expect(ftsDeletes).toHaveLength(2)
      expect(ftsDeletes[0]!.params[0]).toBe('c1')
      expect(ftsDeletes[1]!.params[0]).toBe('c2')

      const chunksDelete = mockRunCalls.find((c) =>
        c.sql.includes('DELETE FROM chunks WHERE file_path'),
      )
      expect(chunksDelete).toBeDefined()
      expect(chunksDelete!.params[0]).toBe('/src/a.ts')
    })

    it('não falha quando arquivo não tem chunks', () => {
      setQueryReturn('SELECT id FROM chunks WHERE file_path', { allResult: [] })
      expect(() => store.deleteByFile('/nonexistent.ts')).not.toThrow()
    })
  })

  describe('searchFts', () => {
    it('retorna resultados com score normalizado', () => {
      setQueryReturn('chunks_fts', {
        allResult: [
          { id: 'c1', file_path: '/a.ts', rank: -5 },
          { id: 'c2', file_path: '/b.ts', rank: -2 },
        ],
      })

      const results = store.searchFts('query', 10)
      expect(results).toHaveLength(2)
      expect(results[0]!.id).toBe('c1')
      expect(results[0]!.filePath).toBe('/a.ts')
      expect(results[0]!.score).toBeGreaterThanOrEqual(0)
      expect(results[0]!.score).toBeLessThanOrEqual(1)
    })

    it('normaliza rank negativo para score 0-1', () => {
      setQueryReturn('chunks_fts', {
        allResult: [{ id: 'c1', file_path: '/a.ts', rank: -1 }],
      })

      const results = store.searchFts('query')
      // score = 1 + (-1/10) = 0.9
      expect(results[0]!.score).toBeCloseTo(0.9, 2)
    })
  })

  describe('getChunkById', () => {
    it('retorna chunk mapeado corretamente', () => {
      setQueryReturn('SELECT * FROM chunks WHERE id', {
        getResult: {
          id: 'c1',
          file_path: '/a.ts',
          language: 'typescript',
          start_line: 0,
          end_line: 10,
          content: 'code',
          symbol_name: 'myFunc',
          chunk_type: 'function',
        },
      })

      const chunk = store.getChunkById('c1')
      expect(chunk).not.toBeNull()
      expect(chunk!.id).toBe('c1')
      expect(chunk!.filePath).toBe('/a.ts')
      expect(chunk!.language).toBe('typescript')
      expect(chunk!.startLine).toBe(0)
      expect(chunk!.endLine).toBe(10)
      expect(chunk!.content).toBe('code')
      expect(chunk!.symbolName).toBe('myFunc')
      expect(chunk!.chunkType).toBe('function')
    })

    it('retorna null quando chunk não existe', () => {
      setQueryReturn('SELECT * FROM chunks WHERE id', { getResult: null })
      expect(store.getChunkById('nonexistent')).toBeNull()
    })

    it('não inclui symbolName quando null no banco', () => {
      setQueryReturn('SELECT * FROM chunks WHERE id', {
        getResult: {
          id: 'c1',
          file_path: '/a.ts',
          language: 'typescript',
          start_line: 0,
          end_line: 5,
          content: 'code',
          symbol_name: null,
          chunk_type: 'block',
        },
      })

      const chunk = store.getChunkById('c1')
      expect(chunk!.symbolName).toBeUndefined()
    })
  })

  describe('getChunksByFile', () => {
    it('retorna chunks mapeados do arquivo', () => {
      setQueryReturn('SELECT * FROM chunks WHERE file_path', {
        allResult: [
          {
            id: 'c1',
            file_path: '/a.ts',
            language: 'typescript',
            start_line: 0,
            end_line: 5,
            content: 'fn1',
            symbol_name: null,
            chunk_type: 'function',
          },
          {
            id: 'c2',
            file_path: '/a.ts',
            language: 'typescript',
            start_line: 6,
            end_line: 10,
            content: 'fn2',
            symbol_name: 'bar',
            chunk_type: 'function',
          },
        ],
      })

      const chunks = store.getChunksByFile('/a.ts')
      expect(chunks).toHaveLength(2)
      expect(chunks[0]!.id).toBe('c1')
      expect(chunks[1]!.symbolName).toBe('bar')
    })
  })

  describe('getAllVectors', () => {
    it('retorna vetores mapeados', () => {
      const buf = Buffer.from([1, 2, 3])
      setQueryReturn('SELECT chunk_id, vector FROM vectors', {
        allResult: [{ chunk_id: 'c1', vector: buf }],
      })

      const vectors = store.getAllVectors()
      expect(vectors).toHaveLength(1)
      expect(vectors[0]!.chunkId).toBe('c1')
      expect(vectors[0]!.vector).toBe(buf)
    })
  })

  describe('getStats', () => {
    it('retorna contagens e indexedAt', () => {
      setQueryReturn('COUNT(*) as count FROM chunks', { getResult: { count: 10 } })
      setQueryReturn('COUNT(*) as count FROM vectors', { getResult: { count: 5 } })
      setQueryReturn('FROM index_meta WHERE key', { getResult: { value: '1700000000000' } })

      const stats = store.getStats()
      expect(stats.totalChunks).toBe(10)
      expect(stats.totalVectors).toBe(5)
      expect(stats.indexedAt).toBeInstanceOf(Date)
    })

    it('retorna indexedAt null quando meta não existe', () => {
      setQueryReturn('COUNT(*) as count FROM chunks', { getResult: { count: 0 } })
      setQueryReturn('COUNT(*) as count FROM vectors', { getResult: { count: 0 } })
      setQueryReturn('FROM index_meta WHERE key', { getResult: null })

      const stats = store.getStats()
      expect(stats.indexedAt).toBeNull()
    })
  })

  describe('setIndexedAt', () => {
    it('persiste timestamp como string', () => {
      const date = new Date('2025-06-15T00:00:00Z')
      store.setIndexedAt(date)

      const insert = mockRunCalls.find((c) => c.sql.includes("'indexed_at'"))
      expect(insert).toBeDefined()
      expect(insert!.params[0]).toBe(date.getTime().toString())
    })
  })

  describe('clear', () => {
    it('executa DELETE em todas as tabelas', () => {
      store.clear()

      expect(mockRunCalls.some((c) => c.sql.includes('DELETE FROM chunks_fts'))).toBe(true)
      expect(mockRunCalls.some((c) => c.sql.includes('DELETE FROM vectors'))).toBe(true)
      expect(mockRunCalls.some((c) => c.sql.includes('DELETE FROM chunks'))).toBe(true)
      expect(mockRunCalls.some((c) => c.sql.includes('DELETE FROM index_meta'))).toBe(true)
    })
  })

  describe('getIndexedFiles', () => {
    it('retorna caminhos únicos', () => {
      setQueryReturn('SELECT DISTINCT file_path FROM chunks', {
        allResult: [{ file_path: '/a.ts' }, { file_path: '/b.ts' }],
      })

      const files = store.getIndexedFiles()
      expect(files.sort()).toEqual(['/a.ts', '/b.ts'])
    })
  })

  describe('file hashes', () => {
    it('setFileHash executa INSERT correto', () => {
      store.setFileHash('/a.ts', 'abc123', 5)

      const insert = mockRunCalls.find((c) => c.sql.includes('file_hashes'))
      expect(insert).toBeDefined()
      expect(insert!.params[0]).toBe('/a.ts')
      expect(insert!.params[1]).toBe('abc123')
      expect(insert!.params[3]).toBe(5)
    })

    it('getFileHash retorna hash', () => {
      setQueryReturn('FROM file_hashes WHERE file_path', {
        getResult: { content_hash: 'abc123' },
      })

      expect(store.getFileHash('/a.ts')).toBe('abc123')
    })

    it('getFileHash retorna null quando inexistente', () => {
      setQueryReturn('FROM file_hashes WHERE file_path', { getResult: null })
      expect(store.getFileHash('/x.ts')).toBeNull()
    })

    it('deleteFileHash executa DELETE', () => {
      store.deleteFileHash('/a.ts')
      const del = mockRunCalls.find((c) => c.sql.includes('DELETE FROM file_hashes'))
      expect(del).toBeDefined()
      expect(del!.params[0]).toBe('/a.ts')
    })
  })

  describe('repo meta (L0)', () => {
    it('saveRepoMeta executa INSERT com campos corretos', () => {
      store.saveRepoMeta({
        language: 'typescript',
        framework: 'express',
        testFramework: 'vitest',
        entryPoints: ['src/index.ts'],
        buildSystem: 'bun',
        architectureStyle: 'hexagonal',
        databaseTech: 'sqlite',
        packageManager: 'bun',
      })

      const insert = mockRunCalls.find((c) => c.sql.includes('repo_meta'))
      expect(insert).toBeDefined()
      expect(insert!.params[0]).toBe('typescript')
      expect(insert!.params[1]).toBe('express')
      expect(insert!.params[3]).toBe(JSON.stringify(['src/index.ts']))
    })

    it('getRepoMeta retorna dados quando existe', () => {
      setQueryReturn('FROM repo_meta WHERE id', {
        getResult: {
          id: 1,
          language: 'typescript',
          framework: 'express',
        },
      })

      const meta = store.getRepoMeta()
      expect(meta).not.toBeNull()
      expect(meta!.language).toBe('typescript')
    })

    it('getRepoMeta retorna null quando vazio', () => {
      setQueryReturn('FROM repo_meta WHERE id', { getResult: null })
      expect(store.getRepoMeta()).toBeNull()
    })

    it('hasRepoMeta retorna false quando count = 0', () => {
      setQueryReturn('COUNT(*) as count FROM repo_meta', { getResult: { count: 0 } })
      expect(store.hasRepoMeta()).toBe(false)
    })

    it('hasRepoMeta retorna true quando count > 0', () => {
      setQueryReturn('COUNT(*) as count FROM repo_meta', { getResult: { count: 1 } })
      expect(store.hasRepoMeta()).toBe(true)
    })
  })

  describe('file summaries (L2)', () => {
    it('saveFileSummary executa INSERT com JSON serializado', () => {
      store.saveFileSummary(
        '/src/a.ts',
        {
          purpose: 'Main entry',
          exports: ['main'],
          patterns: ['singleton'],
          importsExternal: ['express'],
          importsInternal: ['./config'],
          complexity: 'medium',
        },
        'hash123',
      )

      const insert = mockRunCalls.find((c) => c.sql.includes('file_summaries'))
      expect(insert).toBeDefined()
      expect(insert!.params[1]).toBe('/src/a.ts')
      expect(insert!.params[2]).toBe('Main entry')
      expect(insert!.params[3]).toBe(JSON.stringify(['main']))
    })

    it('getFileSummary retorna dados parseados', () => {
      setQueryReturn('FROM file_summaries WHERE file_path', {
        getResult: {
          purpose: 'Main entry',
          exports: JSON.stringify(['main', 'init']),
          file_hash: 'h123',
        },
      })

      const summary = store.getFileSummary('/src/a.ts')
      expect(summary).not.toBeNull()
      expect(summary!.purpose).toBe('Main entry')
      expect(summary!.exports).toEqual(['main', 'init'])
      expect(summary!.fileHash).toBe('h123')
    })

    it('getFileSummary retorna null quando inexistente', () => {
      setQueryReturn('FROM file_summaries WHERE file_path', { getResult: null })
      expect(store.getFileSummary('/x.ts')).toBeNull()
    })

    it('getAllFileSummaries retorna sumários parseados', () => {
      setQueryReturn('FROM file_summaries', {
        allResult: [
          { file_path: '/a.ts', purpose: 'A', exports: '["x"]' },
          { file_path: '/b.ts', purpose: 'B', exports: '[]' },
        ],
      })

      const all = store.getAllFileSummaries()
      expect(all).toHaveLength(2)
      expect(all[0]!.filePath).toBe('/a.ts')
      expect(all[0]!.exports).toEqual(['x'])
    })

    it('getFileSummariesForModule retorna sumários filtrados', () => {
      setQueryReturn('FROM file_summaries WHERE file_path LIKE', {
        allResult: [{ file_path: '/src/auth/login.ts', purpose: 'Login', exports: '["login"]' }],
      })

      const files = store.getFileSummariesForModule('/src/auth/')
      expect(files).toHaveLength(1)
      expect(files[0]!.purpose).toBe('Login')
    })
  })

  describe('patterns (L4)', () => {
    it('savePatterns executa INSERT com todos os campos', () => {
      store.savePatterns({
        namingFunctions: 'camelCase',
        namingClasses: 'PascalCase',
        namingConstants: 'UPPER_SNAKE',
        namingFiles: 'kebab-case',
        namingVariables: 'camelCase',
        errorHandling: 'Result',
        importStyle: 'named',
        testingPatterns: 'vitest',
        architecturePatterns: 'hexagonal',
        antiPatterns: 'none',
      })

      const insert = mockRunCalls.find((c) => c.sql.includes('patterns'))
      expect(insert).toBeDefined()
      expect(insert!.params[0]).toBe('camelCase')
      expect(insert!.params[1]).toBe('PascalCase')
    })

    it('getPatterns retorna dados mapeados', () => {
      setQueryReturn('FROM patterns WHERE id', {
        getResult: {
          naming_functions: 'camelCase',
          naming_classes: 'PascalCase',
          naming_constants: 'UPPER',
          naming_files: 'kebab',
          naming_variables: 'camelCase',
          error_handling: 'Result',
          import_style: 'named',
          testing_patterns: 'vitest',
          architecture_patterns: 'hexagonal',
          anti_patterns: 'none',
        },
      })

      const patterns = store.getPatterns()
      expect(patterns).not.toBeNull()
      expect(patterns!.namingFunctions).toBe('camelCase')
      expect(patterns!.architecturePatterns).toBe('hexagonal')
    })

    it('getPatterns retorna null quando vazio', () => {
      setQueryReturn('FROM patterns WHERE id', { getResult: null })
      expect(store.getPatterns()).toBeNull()
    })

    it('hasPatterns verifica count corretamente', () => {
      setQueryReturn('COUNT(*) as count FROM patterns', { getResult: { count: 0 } })
      expect(store.hasPatterns()).toBe(false)

      setQueryReturn('COUNT(*) as count FROM patterns', { getResult: { count: 1 } })
      expect(store.hasPatterns()).toBe(true)
    })
  })

  describe('schema version', () => {
    it('getSchemaVersion retorna null sem dados', () => {
      setQueryReturn('FROM index_meta WHERE key', { getResult: null })
      expect(store.getSchemaVersion()).toBeNull()
    })

    it('setSchemaVersion persiste version, model e dimensions', () => {
      store.setSchemaVersion(2, 'nomic-embed-text', 768)

      const calls = mockRunCalls.filter((c) => c.sql.includes('index_meta'))
      expect(calls).toHaveLength(3)
      expect(calls[0]!.params[0]).toBe('2')
      expect(calls[1]!.params[0]).toBe('nomic-embed-text')
      expect(calls[2]!.params[0]).toBe('768')
    })

    it('needsReindexForSchema retorna false sem schema prévio', () => {
      setQueryReturn('FROM index_meta WHERE key', { getResult: null })
      expect(store.needsReindexForSchema(1, 'model')).toBe(false)
    })
  })

  describe('getChangedFileRatio', () => {
    it('retorna 1 quando não há file_hashes', () => {
      setQueryReturn('COUNT(*) as count FROM file_hashes', { getResult: { count: 0 } })
      expect(store.getChangedFileRatio()).toBe(1)
    })
  })

  describe('saveModule', () => {
    it('executa INSERT com JSON serializado', () => {
      store.saveModule(
        '/src/auth',
        {
          purpose: 'Auth module',
          publicApi: ['login'],
          dependsOn: ['config'],
          dependedBy: ['api'],
        },
        5,
      )

      const insert = mockRunCalls.find((c) => c.sql.includes('modules'))
      expect(insert).toBeDefined()
      expect(insert!.params[1]).toBe('/src/auth')
      expect(insert!.params[2]).toBe('Auth module')
      expect(insert!.params[3]).toBe(JSON.stringify(['login']))
    })
  })

  describe('close', () => {
    it('fecha conexão sem erro', () => {
      expect(() => store.close()).not.toThrow()
    })
  })
})
