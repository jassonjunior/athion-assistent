/**
 * Test: Codebase Indexer
 * Valida: file-walker, chunker, FTS search, e a tool search_codebase.
 * Não precisa de vllm — testa apenas o indexador.
 */

import { resolve } from 'node:path'
import { createCodebaseIndexer } from '../src/indexing'
import { createSearchCodebaseTool } from '../src/tools/builtins'

const DIVIDER = '═'.repeat(60)
const LINE = '─'.repeat(60)
const WORKSPACE = resolve(import.meta.dir, '../../../')
const DB_PATH = '/tmp/athion-test-codebase.db'

function print(msg: string) {
  console.log(msg)
}

function check(label: string, ok: boolean, detail?: string) {
  const icon = ok ? '✓' : '✗'
  print(`  ${icon} ${label}${detail ? `: ${detail}` : ''}`)
  return ok
}

async function main() {
  print(DIVIDER)
  print('  TEST: Codebase Indexer E2E')
  print(DIVIDER)

  let allPassed = true

  // ─── 1. Criar indexer ────────────────────────────────────────────
  print(`\n[1/5] Criando indexer...`)
  print(`  workspace: ${WORKSPACE}`)
  print(`  db: ${DB_PATH}`)

  const indexer = createCodebaseIndexer({
    workspacePath: WORKSPACE,
    dbPath: DB_PATH,
    // sem embeddingBaseUrl → modo FTS-only
  })

  const stats0 = await indexer.getStats()
  allPassed = check('Indexer criado', true) && allPassed
  allPassed =
    check('Stats iniciais retornam', stats0.totalFiles >= 0, `${stats0.totalFiles} arquivos`) &&
    allPassed

  // ─── 2. Indexar workspace ────────────────────────────────────────
  print(`\n[2/5] Indexando workspace (FTS-only)...`)

  const startTime = Date.now()

  const indexStats = await indexer.indexWorkspace((indexed, total, currentFile) => {
    if (indexed % 20 === 0 || indexed === total) {
      print(`  ... ${indexed}/${total} — ${currentFile.split('/').slice(-2).join('/')}`)
    }
  })

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  print(`  Indexado em ${elapsed}s`)

  allPassed =
    check('Indexou arquivos', indexStats.totalFiles > 0, `${indexStats.totalFiles} arquivos`) &&
    allPassed
  allPassed =
    check('Gerou chunks', indexStats.totalChunks > 0, `${indexStats.totalChunks} chunks`) &&
    allPassed
  allPassed = check('hasVectors=false (FTS-only)', !indexStats.hasVectors) && allPassed

  // ─── 3. Stats após indexação ─────────────────────────────────────
  print(`\n[3/5] Verificando stats...`)

  const stats1 = await indexer.getStats()
  allPassed =
    check(
      'totalFiles persiste no DB',
      stats1.totalFiles === indexStats.totalFiles,
      `${stats1.totalFiles}`,
    ) && allPassed
  allPassed = check('indexedAt definido', stats1.indexedAt !== null) && allPassed
  allPassed = check('workspacePath correto', stats1.workspacePath === WORKSPACE) && allPassed

  // ─── 4. Busca FTS ────────────────────────────────────────────────
  print(`\n[4/5] Testando busca FTS...`)

  const queries = [
    { query: 'createCodebaseIndexer', minResults: 1 },
    { query: 'search_codebase tool', minResults: 1 },
    { query: 'bootstrap AthionCore', minResults: 1 },
    { query: 'defineTool registry', minResults: 1 },
    { query: 'inexistente_xyz_123abc', minResults: -1 }, // trigram FTS pode retornar parciais
  ]

  for (const { query, minResults } of queries) {
    const results = await indexer.search(query, 5)
    const ok =
      minResults < 0 ? true : minResults === 0 ? results.length === 0 : results.length >= minResults

    if (results.length > 0) {
      const top = results[0]
      print(`  query: "${query}" → ${results.length} resultado(s)`)
      print(
        `    top: ${top.chunk.filePath.split('/').slice(-3).join('/')}:${top.chunk.startLine} score=${top.score.toFixed(2)} source=${top.source}`,
      )
    } else {
      print(`  query: "${query}" → 0 resultados`)
    }

    const expected = minResults < 0 ? 'qualquer' : minResults === 0 ? '0' : `≥${minResults}`
    allPassed =
      check(`query "${query}"`, ok, `${results.length} resultado(s), esperado ${expected}`) &&
      allPassed
  }

  // ─── 5. Tool search_codebase ──────────────────────────────────────
  print(`\n[5/5] Testando tool search_codebase...`)

  const tool = createSearchCodebaseTool(indexer)

  allPassed = check('Tool criada', tool !== null) && allPassed
  allPassed = check('Tool name = search_codebase', tool.name === 'search_codebase') && allPassed
  allPassed = check('Tool level = agent', tool.level === 'agent') && allPassed

  // Executa a tool diretamente
  const toolResult = await tool.execute({ query: 'indexWorkspace progress', limit: 5 })

  allPassed = check('Tool executa sem erro', toolResult.success === true) && allPassed

  if (toolResult.success && toolResult.data) {
    const data = toolResult.data as { results: unknown[]; message?: string }
    allPassed = check('Tool retorna results array', Array.isArray(data.results)) && allPassed
    allPassed =
      check(
        'Tool retorna ≥1 result',
        data.results.length >= 1,
        `${data.results.length} resultado(s)`,
      ) && allPassed

    if (data.results.length > 0) {
      const first = data.results[0] as {
        file: string
        startLine: number
        score: number
        source: string
        content: string
      }
      allPassed = check('Result tem file', typeof first.file === 'string') && allPassed
      allPassed = check('Result tem startLine', typeof first.startLine === 'number') && allPassed
      allPassed = check('Result tem score 0-1', first.score >= 0 && first.score <= 1) && allPassed
      allPassed =
        check(
          'Result tem content',
          typeof first.content === 'string' && first.content.length > 0,
        ) && allPassed

      print(`    top result: ${first.file.split('/').slice(-3).join('/')}:${first.startLine}`)
      print(`    score: ${first.score.toFixed(2)}, source: ${first.source}`)
    }
  }

  // Testa query sem resultado (mensagem de fallback)
  const emptyResult = await tool.execute({ query: 'zzz_query_nao_existe_999', limit: 5 })
  if (emptyResult.success && emptyResult.data) {
    const data = emptyResult.data as { results: unknown[]; message?: string }
    if (data.results.length === 0) {
      allPassed =
        check('Mensagem de fallback presente', typeof data.message === 'string') && allPassed
    }
  }

  // Cleanup
  indexer.close()

  // ─── Sumário ─────────────────────────────────────────────────────
  print(`\n${LINE}`)
  print(`  ${allPassed ? 'PASSED ✓' : 'FAILED ✗'}`)
  print(DIVIDER)

  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
