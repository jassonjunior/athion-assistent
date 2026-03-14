import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { CodebaseIndexer } from './manager'
import { SqliteVectorStore } from './adapters/sqlite-vector-store'
import { SqliteTextSearch } from './adapters/sqlite-text-search'
import type { EmbeddingService } from './embeddings'

/** createMockEmbedding
 * Descrição: Cria um mock do EmbeddingService que retorna vetores determinísticos
 */
function createMockEmbedding(): EmbeddingService {
  return {
    embed: vi.fn(async () => [1, 0, 0]),
    embedBatch: vi.fn(async (texts: string[]) =>
      texts.map((_, i) => [i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0]),
    ),
    getDimensions: () => 3,
  }
}

describe('CodebaseIndexer (DI)', () => {
  let indexer: CodebaseIndexer
  let vectorStore: SqliteVectorStore
  let textSearch: SqliteTextSearch
  let tempDir: string
  let workspaceDir: string

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'athion-indexer-test-'))
    workspaceDir = join(tempDir, 'workspace')
    mkdirSync(workspaceDir, { recursive: true })

    const dbPath = join(tempDir, 'index.db')
    vectorStore = new SqliteVectorStore(dbPath)
    textSearch = new SqliteTextSearch(dbPath)
    await vectorStore.initialize()
    await textSearch.initialize()
  })

  afterEach(async () => {
    if (indexer) await indexer.close()
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('aceita ports via constructor (DI)', () => {
    indexer = new CodebaseIndexer(
      { workspacePath: workspaceDir, dbPath: join(tempDir, 'index.db') },
      { vectorStore, textSearch, embedding: null },
    )
    expect(indexer).toBeInstanceOf(CodebaseIndexer)
  })

  it('funciona sem ports (backward-compatible)', () => {
    indexer = new CodebaseIndexer({
      workspacePath: workspaceDir,
      dbPath: join(tempDir, 'index.db'),
    })
    expect(indexer).toBeInstanceOf(CodebaseIndexer)
  })

  it('indexa workspace e retorna stats', async () => {
    // Cria arquivo de teste no workspace
    writeFileSync(join(workspaceDir, 'test.ts'), 'export function hello() { return "world" }')

    indexer = new CodebaseIndexer(
      { workspacePath: workspaceDir, dbPath: join(tempDir, 'index.db') },
      { vectorStore, textSearch, embedding: null },
    )

    const stats = await indexer.indexWorkspace()
    expect(stats.totalFiles).toBeGreaterThanOrEqual(1)
    expect(stats.totalChunks).toBeGreaterThanOrEqual(1)
    expect(stats.workspacePath).toBe(workspaceDir)
  })

  it('busca via FTS com TextSearchPort', async () => {
    writeFileSync(
      join(workspaceDir, 'utils.ts'),
      'export function calculateTotal(items: number[]) {\n  return items.reduce((s, i) => s + i, 0)\n}\n',
    )

    indexer = new CodebaseIndexer(
      { workspacePath: workspaceDir, dbPath: join(tempDir, 'index.db') },
      { vectorStore, textSearch, embedding: null },
    )

    await indexer.indexWorkspace()
    const results = await indexer.search('calculateTotal')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.at(0).source).toBe('fts')
  })

  it('busca híbrida com VectorStore + TextSearch + Embedding', async () => {
    writeFileSync(
      join(workspaceDir, 'api.ts'),
      'export async function fetchUsers() {\n  return await fetch("/api/users")\n}\n',
    )

    const mockEmbed = createMockEmbedding()
    indexer = new CodebaseIndexer(
      { workspacePath: workspaceDir, dbPath: join(tempDir, 'index.db') },
      { vectorStore, textSearch, embedding: mockEmbed },
    )

    await indexer.indexWorkspace()
    expect(mockEmbed.embedBatch).toHaveBeenCalled()

    const results = await indexer.search('fetch users')
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('deleteFile remove de todos os stores', async () => {
    const filePath = join(workspaceDir, 'temp.ts')
    writeFileSync(filePath, 'export const x = 1')

    indexer = new CodebaseIndexer(
      { workspacePath: workspaceDir, dbPath: join(tempDir, 'index.db') },
      { vectorStore, textSearch, embedding: null },
    )

    await indexer.indexWorkspace()
    const statsBefore = indexer.getStats()
    expect(statsBefore.totalChunks).toBeGreaterThanOrEqual(1)

    await indexer.deleteFile(filePath)
    const statsAfter = indexer.getStats()
    expect(statsAfter.totalChunks).toBe(0)
  })

  it('needsReindex retorna true quando nunca indexado', () => {
    indexer = new CodebaseIndexer(
      { workspacePath: workspaceDir, dbPath: join(tempDir, 'index.db') },
      { vectorStore, textSearch, embedding: null },
    )

    expect(indexer.needsReindex()).toBe(true)
  })

  it('needsReindex retorna false após indexação', async () => {
    writeFileSync(join(workspaceDir, 'a.ts'), 'const a = 1')

    indexer = new CodebaseIndexer(
      { workspacePath: workspaceDir, dbPath: join(tempDir, 'index.db') },
      { vectorStore, textSearch, embedding: null },
    )

    await indexer.indexWorkspace()
    expect(indexer.needsReindex()).toBe(false)
  })

  it('onProgress é chamado durante indexação', async () => {
    writeFileSync(join(workspaceDir, 'a.ts'), 'const a = 1')
    writeFileSync(join(workspaceDir, 'b.ts'), 'const b = 2')

    indexer = new CodebaseIndexer(
      { workspacePath: workspaceDir, dbPath: join(tempDir, 'index.db') },
      { vectorStore, textSearch, embedding: null },
    )

    const progress = vi.fn()
    await indexer.indexWorkspace(progress)
    expect(progress).toHaveBeenCalled()
    // Deve ter chamado pelo menos 2x (um por arquivo)
    expect(progress.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
