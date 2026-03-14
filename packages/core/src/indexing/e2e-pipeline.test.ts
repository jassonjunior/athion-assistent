/** E2E Pipeline Tests
 * Descrição: Testes end-to-end do pipeline de indexação completo.
 * Usa fixture de codebase de teste com 3 arquivos TS.
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCodebaseIndexer } from './manager'
import { ContextAssembler, estimateTokens } from './context-builder'
import {
  formatRepoMeta,
  formatPatterns,
  formatFileSummaries,
  formatImpactAnalysis,
  formatHierarchicalPrompt,
} from './context-formatters'
import { DependencyGraph } from './dependency-graph'
import { RetrievalCache } from './retrieval-cache'

/** Fixture de codebase de teste */
const FIXTURE_DIR = join(tmpdir(), `athion-e2e-${Date.now()}`)
const DB_PATH = join(FIXTURE_DIR, 'test-index.db')

const FILES = {
  'src/auth.ts': `
import { db } from './db'
export function login(user: string, password: string): boolean {
  const record = db.findUser(user)
  if (!record) return false
  return record.password === password
}
export function logout(sessionId: string): void {
  db.deleteSession(sessionId)
}
`,
  'src/db.ts': `
export const db = {
  findUser(name: string): { password: string } | null {
    return { password: 'hashed' }
  },
  deleteSession(id: string): void {
    // no-op
  }
}
`,
  'src/api.ts': `
import { login, logout } from './auth'
export function handleLogin(req: { user: string, pass: string }): string {
  const ok = login(req.user, req.pass)
  return ok ? 'success' : 'failed'
}
export function handleLogout(req: { sessionId: string }): void {
  logout(req.sessionId)
}
`,
}

describe('E2E Pipeline', () => {
  beforeAll(() => {
    mkdirSync(join(FIXTURE_DIR, 'src'), { recursive: true })
    for (const [path, content] of Object.entries(FILES)) {
      writeFileSync(join(FIXTURE_DIR, path), content)
    }
  })

  afterAll(() => {
    try {
      rmSync(FIXTURE_DIR, { recursive: true, force: true })
    } catch {
      // Cleanup best-effort
    }
  })

  it('E2E-1: indexação completa processa todos os arquivos', async () => {
    const indexer = createCodebaseIndexer({
      workspacePath: FIXTURE_DIR,
      dbPath: DB_PATH,
    })

    const stats = await indexer.indexWorkspace()

    expect(stats.totalFiles).toBe(3)
    expect(stats.totalChunks).toBeGreaterThan(0)
    expect(stats.indexedAt).not.toBeNull()

    await indexer.close()
  })

  it('E2E-2: Context Builder monta prompt hierárquico', () => {
    const assembler = new ContextAssembler(8000)

    const repoMeta = formatRepoMeta({
      language: 'TypeScript',
      framework: 'Bun',
      testFramework: 'vitest',
    })

    const patterns = formatPatterns({
      namingFunctions: 'camelCase',
      namingClasses: 'PascalCase',
      antiPatterns: '- Não use any',
    })

    const fileSummaries = formatFileSummaries([
      { filePath: 'src/auth.ts', purpose: 'Autenticação', exports: ['login', 'logout'] },
      { filePath: 'src/db.ts', purpose: 'Banco de dados', exports: ['db'] },
    ])

    assembler
      .addBlock({
        name: 'L0',
        priority: 1,
        estimatedTokens: estimateTokens(repoMeta),
        content: repoMeta,
        required: true,
      })
      .addBlock({
        name: 'L4',
        priority: 1,
        estimatedTokens: estimateTokens(patterns),
        content: patterns,
        required: true,
      })
      .addBlock({
        name: 'L2',
        priority: 3,
        estimatedTokens: estimateTokens(fileSummaries),
        content: fileSummaries,
        required: false,
      })

    const result = assembler.assemble()

    expect(result.includedBlocks).toContain('L0')
    expect(result.includedBlocks).toContain('L4')
    expect(result.includedBlocks).toContain('L2')
    expect(result.totalTokens).toBeLessThanOrEqual(8000)
    expect(result.text).toContain('TypeScript')
    expect(result.text).toContain('camelCase')
  })

  it('E2E-3: busca retorna resultados relevantes', async () => {
    const indexer = createCodebaseIndexer({
      workspacePath: FIXTURE_DIR,
      dbPath: DB_PATH,
    })

    // Busca por FTS (sem embeddings configurados)
    const results = await indexer.search('login', 5)

    // Deve encontrar algo via FTS (trigram tokenizer)
    expect(results.length).toBeGreaterThan(0)
    expect(results.some((r) => r.chunk.content.includes('login'))).toBe(true)

    await indexer.close()
  })

  it('E2E-4: DependencyGraph identifica dependentes', () => {
    const graph = new DependencyGraph()

    graph.addFile('src/api.ts', ['src/auth.ts'])
    graph.addFile('src/auth.ts', ['src/db.ts'])
    graph.addFile('src/db.ts', [])

    const impact = graph.getImpactAnalysis('src/db.ts')

    expect(impact.directDependents).toContain('src/auth.ts')
    expect(impact.transitiveDependents).toContain('src/api.ts')
    expect(impact.riskLevel).toBe('low')

    // Formata para prompt
    const formatted = formatImpactAnalysis([{ filePath: 'src/db.ts', impact }])
    expect(formatted).toContain('Análise de Impacto')
    expect(formatted).toContain('src/auth.ts')
  })

  it('E2E-5: re-indexação skip arquivos sem mudança (file hash)', async () => {
    const indexer = createCodebaseIndexer({
      workspacePath: FIXTURE_DIR,
      dbPath: DB_PATH,
    })

    // Primeira indexação
    await indexer.indexWorkspace()
    const stats1 = indexer.getStats()

    // Segunda indexação — deve fazer skip (hash match)
    await indexer.indexWorkspace()
    const stats2 = indexer.getStats()

    // Mesmos chunks
    expect(stats2.totalChunks).toBe(stats1.totalChunks)

    await indexer.close()
  })

  it('E2E-6: formatHierarchicalPrompt na ordem correta', () => {
    const result = formatHierarchicalPrompt({
      repoMeta: '## Repo\n- TS',
      patterns: '## Patterns\n- camelCase',
      impactAnalysis: '## Impact\n- 2 files',
      fileSummaries: '## Files\n- auth.ts',
      symbols: '## Symbols\n- login()',
      task: 'Corrija o bug',
    })

    const order = [
      result.indexOf('Repo'),
      result.indexOf('Patterns'),
      result.indexOf('Impact'),
      result.indexOf('Files'),
      result.indexOf('Symbols'),
      result.indexOf('Corrija'),
    ]

    // Cada seção deve vir depois da anterior
    for (let i = 1; i < order.length; i++) {
      expect(order[i]).toBeGreaterThan(order[i - 1] ?? -1)
    }

    expect(result).toContain('Siga EXATAMENTE as convenções')
  })

  it('E2E-7: RetrievalCache integra com invalidação', () => {
    const cache = new RetrievalCache<string[]>(50, 60_000)

    // Simula cache de resultados de busca
    cache.set('search:login', ['auth.ts:10', 'api.ts:5'])
    expect(cache.get('search:login')).toEqual(['auth.ts:10', 'api.ts:5'])

    // Invalidação por pattern (simula codebase:indexing_completed)
    cache.invalidate('search:')
    expect(cache.get('search:login')).toBeUndefined()
  })
})
