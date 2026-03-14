/** Teste E2E do sistema de indexação (Fase 0)
 * Descrição: Testa o fluxo completo de indexação e busca integrando todos
 * os componentes: CodebaseIndexer + SqliteVectorStore + SqliteTextSearch +
 * Mock de EmbeddingService. Simula o uso real com workspace contendo
 * múltiplos arquivos TypeScript e Python.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCodebaseIndexer } from './manager'
import { SqliteVectorStore } from './adapters/sqlite-vector-store'
import { SqliteTextSearch } from './adapters/sqlite-text-search'
import type { EmbeddingService } from './embeddings'
import { createBus } from '../bus/bus'
import { FileChanged, IndexingStarted, IndexingCompleted } from '../bus/events'

/** createDeterministicEmbedding
 * Descrição: Cria um EmbeddingService mock que gera vetores determinísticos
 * baseados no hash do texto para testes reproduzíveis
 */
function createDeterministicEmbedding(): EmbeddingService {
  function textToVector(text: string): number[] {
    // Hash simples para gerar vetor determinístico de 8 dimensões
    const vec = new Array(8).fill(0) as number[]
    for (let i = 0; i < text.length; i++) {
      vec[i % 8] += text.charCodeAt(i) / 1000
    }
    // Normaliza
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0))
    return norm > 0 ? vec.map((v) => v / norm) : vec
  }

  return {
    embed: vi.fn(async (text: string) => textToVector(text)),
    embedBatch: vi.fn(async (texts: string[]) => texts.map(textToVector)),
    getDimensions: () => 8,
  }
}

describe('Indexação E2E — Fluxo Completo', () => {
  let tempDir: string
  let workspaceDir: string
  let dbPath: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'athion-e2e-'))
    workspaceDir = join(tempDir, 'workspace')
    dbPath = join(tempDir, 'index.db')
    mkdirSync(workspaceDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  /** setupWorkspace
   * Descrição: Cria uma estrutura de workspace realista com múltiplos arquivos
   */
  function setupWorkspace() {
    mkdirSync(join(workspaceDir, 'src'), { recursive: true })
    mkdirSync(join(workspaceDir, 'src', 'utils'), { recursive: true })

    writeFileSync(
      join(workspaceDir, 'src', 'api.ts'),
      `/** fetchUsers
 * Descrição: Busca lista de usuários da API
 */
export async function fetchUsers(page: number = 1): Promise<User[]> {
  const response = await fetch(\`/api/users?page=\${page}\`)
  if (!response.ok) throw new Error('Failed to fetch users')
  return response.json()
}

/** fetchUserById
 * Descrição: Busca um usuário específico por ID
 */
export async function fetchUserById(id: string): Promise<User> {
  const response = await fetch(\`/api/users/\${id}\`)
  if (!response.ok) throw new Error(\`User \${id} not found\`)
  return response.json()
}

interface User {
  id: string
  name: string
  email: string
}
`,
    )

    writeFileSync(
      join(workspaceDir, 'src', 'utils', 'validators.ts'),
      `/** validateEmail
 * Descrição: Valida formato de email usando regex
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/
  return emailRegex.test(email)
}

/** validatePassword
 * Descrição: Valida senha com regras de segurança
 */
export function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (password.length < 8) errors.push('Mínimo 8 caracteres')
  if (!/[A-Z]/.test(password)) errors.push('Pelo menos uma maiúscula')
  if (!/[0-9]/.test(password)) errors.push('Pelo menos um número')
  return { valid: errors.length === 0, errors }
}
`,
    )

    writeFileSync(
      join(workspaceDir, 'src', 'database.ts'),
      `/** DatabaseConnection
 * Descrição: Classe de conexão com banco de dados
 */
export class DatabaseConnection {
  private connected = false

  constructor(private url: string) {}

  async connect(): Promise<void> {
    this.connected = true
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this.connected) throw new Error('Not connected')
    return [] as T[]
  }

  async close(): Promise<void> {
    this.connected = false
  }
}
`,
    )
  }

  it('indexa workspace completo e busca por FTS', async () => {
    setupWorkspace()

    const vectorStore = new SqliteVectorStore(dbPath)
    const textSearch = new SqliteTextSearch(dbPath)
    await vectorStore.initialize()
    await textSearch.initialize()

    const indexer = createCodebaseIndexer(
      { workspacePath: workspaceDir, dbPath },
      { vectorStore, textSearch, embedding: null },
    )

    const stats = await indexer.indexWorkspace()
    expect(stats.totalFiles).toBe(3)
    expect(stats.totalChunks).toBeGreaterThanOrEqual(3)
    expect(stats.hasVectors).toBe(false) // sem embeddings

    // Busca por nome de função
    const results = await indexer.search('fetchUsers')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results.at(0).chunk.filePath).toContain('api.ts')
    expect(results.at(0).source).toBe('fts')

    await indexer.close()
  })

  it('busca híbrida combina FTS + Vector', async () => {
    setupWorkspace()

    const vectorStore = new SqliteVectorStore(dbPath)
    const textSearch = new SqliteTextSearch(dbPath)
    await vectorStore.initialize()
    await textSearch.initialize()

    const embedding = createDeterministicEmbedding()
    const indexer = createCodebaseIndexer(
      { workspacePath: workspaceDir, dbPath },
      { vectorStore, textSearch, embedding },
    )

    await indexer.indexWorkspace()
    const stats = indexer.getStats()
    expect(stats.hasVectors).toBe(true) // com embeddings

    // Busca semântica
    const results = await indexer.search('validação de dados')
    expect(results.length).toBeGreaterThanOrEqual(1)

    // Pelo menos um resultado deve vir do vector search ou ser hybrid
    const hasVectorOrHybrid = results.some((r) => r.source === 'vector' || r.source === 'hybrid')
    expect(hasVectorOrHybrid).toBe(true)

    await indexer.close()
  })

  it('re-indexação incremental atualiza arquivo', async () => {
    setupWorkspace()

    const vectorStore = new SqliteVectorStore(dbPath)
    const textSearch = new SqliteTextSearch(dbPath)
    await vectorStore.initialize()
    await textSearch.initialize()

    const indexer = createCodebaseIndexer(
      { workspacePath: workspaceDir, dbPath },
      { vectorStore, textSearch, embedding: null },
    )

    await indexer.indexWorkspace()

    // Modifica arquivo
    const apiPath = join(workspaceDir, 'src', 'api.ts')
    writeFileSync(
      apiPath,
      `export async function fetchProducts(): Promise<Product[]> {
  return fetch('/api/products').then(r => r.json())
}
interface Product { id: string; name: string; price: number }
`,
    )

    // Re-indexa apenas o arquivo modificado
    await indexer.indexFile(apiPath)

    // Busca pelo novo conteúdo
    const results = await indexer.search('fetchProducts')
    expect(results.length).toBeGreaterThanOrEqual(1)

    // Busca pelo conteúdo antigo não deve retornar
    const oldResults = await indexer.search('fetchUsers')
    const hasOldInApi = oldResults.some((r) => r.chunk.filePath.includes('api.ts'))
    expect(hasOldInApi).toBe(false)

    await indexer.close()
  })

  it('deleteFile remove arquivo do índice', async () => {
    setupWorkspace()

    const vectorStore = new SqliteVectorStore(dbPath)
    const textSearch = new SqliteTextSearch(dbPath)
    await vectorStore.initialize()
    await textSearch.initialize()

    const indexer = createCodebaseIndexer(
      { workspacePath: workspaceDir, dbPath },
      { vectorStore, textSearch, embedding: null },
    )

    await indexer.indexWorkspace()
    const statsBefore = indexer.getStats()

    // Remove database.ts
    const dbFile = join(workspaceDir, 'src', 'database.ts')
    await indexer.deleteFile(dbFile)

    const statsAfter = indexer.getStats()
    expect(statsAfter.totalChunks).toBeLessThan(statsBefore.totalChunks)

    // Busca por DatabaseConnection não deve retornar resultados daquele arquivo
    const results = await indexer.search('DatabaseConnection')
    const hasDeletedFile = results.some((r) => r.chunk.filePath.includes('database.ts'))
    expect(hasDeletedFile).toBe(false)

    await indexer.close()
  })

  it('factory function createCodebaseIndexer funciona sem deps (backward-compatible)', async () => {
    setupWorkspace()

    const indexer = createCodebaseIndexer({
      workspacePath: workspaceDir,
      dbPath,
    })

    const stats = await indexer.indexWorkspace()
    expect(stats.totalFiles).toBe(3)
    expect(stats.totalChunks).toBeGreaterThanOrEqual(3)

    const results = await indexer.search('validateEmail')
    expect(results.length).toBeGreaterThanOrEqual(1)

    await indexer.close()
  })

  it('progress callback reporta progresso corretamente', async () => {
    setupWorkspace()

    const indexer = createCodebaseIndexer(
      { workspacePath: workspaceDir, dbPath },
      { embedding: null },
    )

    const progressCalls: Array<{ indexed: number; total: number; file: string }> = []
    await indexer.indexWorkspace((indexed, total, file) => {
      progressCalls.push({ indexed, total, file })
    })

    expect(progressCalls.length).toBe(3) // 3 arquivos
    expect(progressCalls.at(0).indexed).toBe(0) // primeiro arquivo: indexed=0
    expect(progressCalls.at(0).total).toBe(3)
    expect(progressCalls.at(2).indexed).toBe(2) // último: indexed=2

    await indexer.close()
  })

  it('eventos do bus podem ser usados com o fluxo de indexação', () => {
    // Teste de integração: verifica que os eventos definidos no bus
    // são compatíveis com o fluxo de indexação
    const bus = createBus()
    const events: string[] = []

    bus.subscribe(FileChanged, (data) => {
      events.push(`file:${data.event}:${data.filePath}`)
    })

    bus.subscribe(IndexingStarted, (data) => {
      events.push(`start:${data.level}:${data.filePath}`)
    })

    bus.subscribe(IndexingCompleted, (data) => {
      events.push(`done:${data.chunksIndexed}:${data.durationMs}ms`)
    })

    // Simula o fluxo que será usado nas Fases 1-5
    bus.publish(FileChanged, {
      filePath: '/src/app.ts',
      event: 'change',
      timestamp: Date.now(),
    })

    bus.publish(IndexingStarted, {
      filePath: '/src/app.ts',
      level: 'L3',
    })

    bus.publish(IndexingCompleted, {
      filePath: '/src/app.ts',
      chunksIndexed: 5,
      durationMs: 42,
      enriched: false,
    })

    expect(events).toEqual(['file:change:/src/app.ts', 'start:L3:/src/app.ts', 'done:5:42ms'])
  })
})
