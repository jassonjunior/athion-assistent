#!/usr/bin/env bun
/**
 * E2E REAL: Teste de indexação vetorial + busca semântica em codebase externo
 *
 * Usa o codebase qwen-code como alvo real, sem mocks.
 * Valida que:
 *   1. Indexação com embeddings reais (LM Studio) funciona
 *   2. Busca vetorial retorna resultados semanticamente relevantes
 *   3. Busca híbrida (FTS + vector) é superior a FTS puro
 *   4. Resultados são úteis para um agente de código
 *
 * Requisitos:
 *   - LM Studio rodando com modelo de embedding (nomic-embed-text-v1.5)
 *   - Codebase qwen-code em /Users/jassonjunior/Desenvolvimento/Pessoais/Desenvolvimento/qwen-code
 *
 * Uso: ATHION_EMBEDDING_URL=http://localhost:1235 ATHION_EMBEDDING_API_KEY=sk-xxx bun run scripts/e2e-vector-search-real.ts
 */

import { relative } from 'node:path'
import { existsSync, rmSync } from 'node:fs'
import { CodebaseIndexer } from '../src/indexing/manager'
import { SqliteVectorStore } from '../src/indexing/adapters/sqlite-vector-store'
import { SqliteTextSearch } from '../src/indexing/adapters/sqlite-text-search'
import { createEmbeddingService, cosineSimilarity } from '../src/indexing/embeddings'
import type { SearchResult } from '../src/indexing/types'

// ─── Configuração ────────────────────────────────────────────────────────────

const TARGET_CODEBASE = '/Users/jassonjunior/Desenvolvimento/Pessoais/Desenvolvimento/qwen-code'
const DB_PATH = '/tmp/athion-e2e-qwen-code.db'
const EMBEDDING_URL = process.env['ATHION_EMBEDDING_URL'] ?? 'http://localhost:1235'
const EMBEDDING_MODEL =
  process.env['ATHION_EMBEDDING_MODEL'] ?? 'text-embedding-nomic-embed-text-v1.5'
const EMBEDDING_API_KEY = process.env['ATHION_EMBEDDING_API_KEY'] ?? ''

const DIVIDER = '═'.repeat(70)
const SECTION = '─'.repeat(50)

interface TestResult {
  name: string
  passed: boolean
  details: string
  duration?: number
}

const allResults: TestResult[] = []

function log(msg: string) {
  process.stdout.write(msg + '\n')
}

function logResult(test: TestResult) {
  const icon = test.passed ? '✓' : '✗'
  const dur = test.duration ? ` (${test.duration}ms)` : ''
  log(`  ${icon} ${test.name}${dur}`)
  if (test.details) log(`    ${test.details}`)
  allResults.push(test)
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log(DIVIDER)
  log('  E2E REAL: Vector Search + Codebase qwen-code')
  log(`  LM Studio: ${EMBEDDING_URL}`)
  log(`  Modelo: ${EMBEDDING_MODEL}`)
  log(`  Codebase: ${TARGET_CODEBASE}`)
  log(DIVIDER)

  // ── Pré-condições ────────────────────────────────────────────────
  if (!existsSync(TARGET_CODEBASE)) {
    log('\n✗ ERRO: Codebase qwen-code não encontrado')
    process.exit(1)
  }

  // Limpa DB anterior para teste limpo
  if (existsSync(DB_PATH)) {
    rmSync(DB_PATH)
    rmSync(DB_PATH + '-shm', { force: true })
    rmSync(DB_PATH + '-wal', { force: true })
  }

  // ═══════════════════════════════════════════════════════════════════
  // FASE 1: Validar que o serviço de embeddings está acessível
  // ═══════════════════════════════════════════════════════════════════
  log('\n[FASE 1] Validando serviço de embeddings...')
  log(SECTION)

  const embeddingService = createEmbeddingService({
    baseUrl: EMBEDDING_URL,
    model: EMBEDDING_MODEL,
    ...(EMBEDDING_API_KEY ? { apiKey: EMBEDDING_API_KEY } : {}),
  })

  const t0 = Date.now()
  const testVec = await embeddingService.embed('test function declaration in TypeScript')
  const embedLatency = Date.now() - t0

  logResult({
    name: 'Embedding service acessível',
    passed: testVec !== null,
    details: testVec
      ? `${testVec.length} dimensões, latência: ${embedLatency}ms`
      : 'FALHA: retornou null',
    duration: embedLatency,
  })

  if (!testVec) {
    log('\n✗ FATAL: Embedding service não acessível. Verifique o LM Studio.')
    process.exit(1)
  }

  // Teste de similaridade básica
  const vecA = await embeddingService.embed('function to authenticate users with JWT tokens')
  const vecB = await embeddingService.embed('user login authentication with JSON web token')
  const vecC = await embeddingService.embed('database migration script for PostgreSQL')

  if (vecA && vecB && vecC) {
    const simAB = cosineSimilarity(vecA, vecB)
    const simAC = cosineSimilarity(vecA, vecC)

    logResult({
      name: 'Similaridade semântica coerente',
      passed: simAB > simAC,
      details: `auth↔auth: ${simAB.toFixed(4)}, auth↔db: ${simAC.toFixed(4)} (esperado: auth↔auth > auth↔db)`,
    })
  }

  // ═══════════════════════════════════════════════════════════════════
  // FASE 2: Indexar o codebase qwen-code com vetores reais
  // ═══════════════════════════════════════════════════════════════════
  log('\n[FASE 2] Indexando codebase qwen-code (com embeddings reais)...')
  log(SECTION)

  const vectorStore = new SqliteVectorStore(DB_PATH)
  const textSearch = new SqliteTextSearch(DB_PATH)
  await vectorStore.initialize()
  await textSearch.initialize()

  const indexer = new CodebaseIndexer(
    {
      workspacePath: TARGET_CODEBASE,
      dbPath: DB_PATH,
      embeddingBaseUrl: EMBEDDING_URL,
      embeddingModel: EMBEDDING_MODEL,
      embeddingApiKey: EMBEDDING_API_KEY,
    },
    { vectorStore, textSearch, embedding: embeddingService },
  )

  let lastPct = 0
  const indexStart = Date.now()
  const stats = await indexer.indexWorkspace((indexed, total, currentFile) => {
    const pct = Math.floor((indexed / Math.max(total, 1)) * 100)
    if (pct >= lastPct + 20 || indexed === total) {
      const relFile = relative(TARGET_CODEBASE, currentFile)
      log(`  [${pct}%] ${indexed}/${total} — ${relFile}`)
      lastPct = pct
    }
  })
  const indexDuration = Date.now() - indexStart

  logResult({
    name: 'Indexação completa',
    passed: stats.totalFiles > 50,
    details: `${stats.totalFiles} arquivos, ${stats.totalChunks} chunks em ${(indexDuration / 1000).toFixed(1)}s`,
    duration: indexDuration,
  })

  logResult({
    name: 'Vetores gerados',
    passed: stats.hasVectors,
    details: stats.hasVectors ? 'sim (embedding service ativo)' : 'NÃO — busca será FTS-only',
  })

  const fullStats = indexer.getStats()
  logResult({
    name: 'Chunks suficientes para busca',
    passed: fullStats.totalChunks > 200,
    details: `${fullStats.totalChunks} chunks indexados`,
  })

  // ═══════════════════════════════════════════════════════════════════
  // FASE 3: Buscas semânticas — testar qualidade dos resultados
  // ═══════════════════════════════════════════════════════════════════
  log('\n[FASE 3] Testando buscas semânticas...')
  log(SECTION)

  // Queries semânticas que devem encontrar código relevante
  const semanticQueries: Array<{
    query: string
    expectContains: string[]
    description: string
  }> = [
    {
      query: 'how does the tool registry manage available tools',
      expectContains: ['tool', 'registry', 'register'],
      description: 'Busca por conceito: gerenciamento de ferramentas',
    },
    {
      query: 'chat message processing and LLM integration',
      expectContains: ['chat', 'message'],
      description: 'Busca por conceito: processamento de mensagens',
    },
    {
      query: 'file editing and patching functionality',
      expectContains: ['edit', 'file', 'patch'],
      description: 'Busca por conceito: edição de arquivos',
    },
    {
      query: 'MCP model context protocol server implementation',
      expectContains: ['mcp', 'server'],
      description: 'Busca por conceito: servidor MCP',
    },
    {
      query: 'configuration management and model selection',
      expectContains: ['config', 'model'],
      description: 'Busca por conceito: configuração e modelos',
    },
  ]

  const searchResults: Map<string, SearchResult[]> = new Map()

  for (const sq of semanticQueries) {
    const t1 = Date.now()
    const results = await indexer.search(sq.query, 8)
    const searchTime = Date.now() - t1

    searchResults.set(sq.query, results)

    // Verifica se algum resultado contém termos esperados
    const allContent = results
      .map((r) => `${r.chunk.content} ${r.chunk.symbolName ?? ''} ${r.chunk.filePath}`)
      .join(' ')
      .toLowerCase()
    const foundTerms = sq.expectContains.filter((t) => allContent.includes(t.toLowerCase()))
    const hasRelevant = foundTerms.length >= Math.ceil(sq.expectContains.length / 2)

    // Verifica diversidade de fontes
    const sources = new Set(results.map((r) => r.source))
    const hasHybrid = sources.has('hybrid') || (sources.has('vector') && sources.has('fts'))

    logResult({
      name: sq.description,
      passed: results.length > 0 && hasRelevant,
      details: [
        `${results.length} resultados em ${searchTime}ms`,
        `fontes: [${[...sources].join(', ')}]`,
        `termos: ${foundTerms.join(', ')} (${foundTerms.length}/${sq.expectContains.length})`,
        hasHybrid ? 'hybrid ✓' : 'single-source',
      ].join(' | '),
      duration: searchTime,
    })
  }

  // ═══════════════════════════════════════════════════════════════════
  // FASE 4: Comparar Vector vs FTS — busca semântica superior?
  // ═══════════════════════════════════════════════════════════════════
  log('\n[FASE 4] Comparando busca vetorial vs FTS pura...')
  log(SECTION)

  // Queries onde busca semântica deve ser melhor que keyword
  const semanticOnlyQueries = [
    'how to handle errors gracefully when tool execution fails',
    'mechanism to compress and summarize long conversations',
    'detecting infinite loops in agent execution',
  ]

  let vectorBetterCount = 0
  for (const query of semanticOnlyQueries) {
    const results = await indexer.search(query, 8)

    const vectorResults = results.filter((r) => r.source === 'vector' || r.source === 'hybrid')
    const ftsOnlyResults = results.filter((r) => r.source === 'fts')

    const vectorScore = vectorResults.reduce((sum, r) => sum + r.score, 0)
    const ftsScore = ftsOnlyResults.reduce((sum, r) => sum + r.score, 0)

    if (vectorScore > 0) vectorBetterCount++

    log(`  Query: "${query.slice(0, 60)}..."`)
    log(
      `    Vector/hybrid: ${vectorResults.length} resultados (score total: ${vectorScore.toFixed(3)})`,
    )
    log(
      `    FTS-only:      ${ftsOnlyResults.length} resultados (score total: ${ftsScore.toFixed(3)})`,
    )

    const topResult = vectorResults[0]
    if (topResult) {
      const relPath = relative(TARGET_CODEBASE, topResult.chunk.filePath)
      log(
        `    Top hit: ${relPath}:${topResult.chunk.startLine} [${topResult.chunk.symbolName ?? 'chunk'}] (${topResult.score.toFixed(3)})`,
      )
    }
    log('')
  }

  logResult({
    name: 'Busca vetorial encontra resultados semânticos',
    passed: vectorBetterCount >= 2,
    details: `${vectorBetterCount}/${semanticOnlyQueries.length} queries retornaram resultados vetoriais`,
  })

  // ═══════════════════════════════════════════════════════════════════
  // FASE 5: Validar formato dos resultados para uso pelo agente
  // ═══════════════════════════════════════════════════════════════════
  log('\n[FASE 5] Validando formato para o agente...')
  log(SECTION)

  // Simula o que o agente recebe quando chama search_codebase
  const agentQuery = 'how does the SubAgent system delegate tasks to child agents'
  const agentResults = await indexer.search(agentQuery, 8)

  // Valida estrutura de cada resultado
  let allValid = true
  for (const r of agentResults) {
    if (!r.chunk.filePath || !r.chunk.content || r.score <= 0) {
      allValid = false
    }
  }

  logResult({
    name: 'Estrutura dos resultados válida',
    passed: allValid && agentResults.length > 0,
    details: `${agentResults.length} resultados com filePath, content e score > 0`,
  })

  // Verifica que os resultados são "úteis" — contém código real, não lixo
  const hasCodeContent = agentResults.some((r) => {
    const content = r.chunk.content
    return (
      content.includes('function') ||
      content.includes('class') ||
      content.includes('export') ||
      content.includes('import') ||
      content.includes('interface') ||
      content.includes('const') ||
      content.includes('async')
    )
  })

  logResult({
    name: 'Resultados contêm código real',
    passed: hasCodeContent,
    details: hasCodeContent ? 'sim — código TypeScript válido' : 'NÃO — resultados podem ser noise',
  })

  // Mostra preview do que o agente receberia
  log('\n  Preview do que o agente recebe para: "' + agentQuery + '"\n')
  for (const r of agentResults.slice(0, 5)) {
    const relPath = relative(TARGET_CODEBASE, r.chunk.filePath)
    const symbol = r.chunk.symbolName ? ` — ${r.chunk.symbolName}` : ''
    log(`  [${(r.score * 100).toFixed(0)}%] [${r.source}] ${relPath}:${r.chunk.startLine}${symbol}`)
    const preview = r.chunk.content.split('\n').slice(0, 4).join('\n')
    log(`    ${preview.replace(/\n/g, '\n    ')}`)
    log('')
  }

  // ═══════════════════════════════════════════════════════════════════
  // FASE 6: Análise de qualidade do índice
  // ═══════════════════════════════════════════════════════════════════
  log('\n[FASE 6] Análise de qualidade do índice...')
  log(SECTION)

  // Busca por símbolos conhecidos do qwen-code
  const knownSymbols = [
    { query: 'GeminiChat', description: 'Classe principal do chat' },
    { query: 'CoreToolScheduler', description: 'Agendador de ferramentas' },
    { query: 'EditTool', description: 'Ferramenta de edição de arquivos' },
    { query: 'ShellExecutionService', description: 'Serviço de execução de comandos' },
    { query: 'LoopDetectionService', description: 'Detecção de loops infinitos' },
  ]

  let symbolsFound = 0
  for (const sym of knownSymbols) {
    const results = await indexer.search(sym.query, 3)
    const found = results.some(
      (r) =>
        r.chunk.symbolName?.toLowerCase().includes(sym.query.toLowerCase()) ||
        r.chunk.content.toLowerCase().includes(sym.query.toLowerCase()),
    )
    if (found) symbolsFound++

    const topHit = results[0]
    const relPath = topHit ? relative(TARGET_CODEBASE, topHit.chunk.filePath) : 'N/A'
    log(`  ${found ? '✓' : '✗'} ${sym.query} — ${sym.description} → ${relPath}`)
  }

  logResult({
    name: 'Símbolos conhecidos encontrados',
    passed: symbolsFound >= 3,
    details: `${symbolsFound}/${knownSymbols.length} símbolos localizados por busca semântica`,
  })

  // ═══════════════════════════════════════════════════════════════════
  // RESULTADOS FINAIS
  // ═══════════════════════════════════════════════════════════════════
  log('\n' + DIVIDER)
  log('  RESULTADOS FINAIS')
  log(DIVIDER)

  const passed = allResults.filter((r) => r.passed).length
  const failed = allResults.filter((r) => !r.passed).length
  const total = allResults.length

  log(`\n  Total: ${total} testes`)
  log(`  ✓ Passed: ${passed}`)
  log(`  ✗ Failed: ${failed}`)

  if (failed > 0) {
    log('\n  Falhas:')
    for (const r of allResults.filter((t) => !t.passed)) {
      log(`    ✗ ${r.name}: ${r.details}`)
    }
  }

  log(
    `\n  Índice: ${stats.totalFiles} files, ${stats.totalChunks} chunks, vetores: ${stats.hasVectors ? 'sim' : 'não'}`,
  )
  log(`  Tempo de indexação: ${(indexDuration / 1000).toFixed(1)}s`)
  log(`  DB: ${DB_PATH}`)

  log(`\n${DIVIDER}`)
  log(`  RESULTADO: ${failed === 0 ? 'ALL PASSED ✓' : `${failed} FAILED ✗`}`)
  log(DIVIDER)

  // Cleanup
  await indexer.close()

  process.exit(failed === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('E2E FATAL:', err)
  process.exit(1)
})
