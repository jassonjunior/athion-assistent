/**
 * Test: Busca Vetorial (Vector Search)
 * Valida indexação com embeddings + busca por similaridade coseno.
 * Requer: nomic-embed-text rodando em ATHION_EMBEDDING_URL (default: http://localhost:1234)
 */

import { resolve } from 'node:path'
import { createCodebaseIndexer } from '../src/indexing'
import { createEmbeddingService } from '../src/indexing/embeddings'

const DIVIDER = '═'.repeat(60)
const LINE = '─'.repeat(60)
const WORKSPACE = resolve(import.meta.dir, '../../../')
const DB_PATH = '/tmp/athion-test-vector.db'

// URL do servidor de embeddings (LMStudio com nomic-embed-text)
const EMBEDDING_URL = process.env.ATHION_EMBEDDING_URL ?? 'http://localhost:1234'
const EMBEDDING_MODEL = process.env.ATHION_EMBEDDING_MODEL ?? 'nomic-embed-text'

function print(msg: string) {
  console.log(msg)
}
function check(label: string, ok: boolean, detail?: string) {
  print(`  ${ok ? '✓' : '✗'} ${label}${detail ? `: ${detail}` : ''}`)
  return ok
}

async function main() {
  print(DIVIDER)
  print('  TEST: Vector Search (Embeddings + Cosine Similarity)')
  print(DIVIDER)
  print(`  Embedding URL: ${EMBEDDING_URL}`)
  print(`  Embedding Model: ${EMBEDDING_MODEL}`)

  let allPassed = true

  // ─── 1. Testar conexão com serviço de embeddings ──────────────────
  print('\n[1/4] Testando conexão com embedding service...')

  const embeddingService = createEmbeddingService({
    baseUrl: EMBEDDING_URL,
    model: EMBEDDING_MODEL,
  })

  try {
    const testVec = await embeddingService.embed('teste de conexão com embedding service')
    allPassed = check('Conexão bem-sucedida', true) && allPassed
    allPassed =
      check(
        'Vetor retornado',
        Array.isArray(testVec) && testVec.length > 0,
        `dim=${testVec.length}`,
      ) && allPassed
    allPassed =
      check(
        'Valores float válidos',
        testVec.every((v) => typeof v === 'number' && !isNaN(v)),
      ) && allPassed
    print(`  dimensão do embedding: ${testVec.length}`)
  } catch (err) {
    print(`  ✗ Falha na conexão: ${err instanceof Error ? err.message : String(err)}`)
    print(`\n  DICA: Carregue o modelo "${EMBEDDING_MODEL}" no LMStudio e configure`)
    print(`  ATHION_EMBEDDING_URL=http://localhost:1234 bun scripts/test-vector-search.ts`)
    print(`\n  FAILED ✗`)
    print(DIVIDER)
    process.exit(1)
  }

  // ─── 2. Indexar workspace COM embeddings ─────────────────────────
  print('\n[2/4] Indexando workspace com embeddings...')

  const indexer = createCodebaseIndexer({
    workspacePath: WORKSPACE,
    dbPath: DB_PATH,
    embeddingBaseUrl: EMBEDDING_URL,
    embeddingModel: EMBEDDING_MODEL,
  })

  const startTime = Date.now()
  const stats = await indexer.indexWorkspace((indexed, total, currentFile) => {
    if (indexed % 30 === 0 || indexed === total) {
      const pct = Math.round((indexed / total) * 100)
      print(`  ... ${indexed}/${total} (${pct}%) — ${currentFile.split('/').slice(-2).join('/')}`)
    }
  })
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  print(`  Indexado em ${elapsed}s`)
  allPassed = check('Arquivos indexados', stats.totalFiles > 0, `${stats.totalFiles}`) && allPassed
  allPassed = check('Chunks gerados', stats.totalChunks > 0, `${stats.totalChunks}`) && allPassed
  allPassed = check('Vetores gerados (hasVectors=true)', stats.hasVectors === true) && allPassed

  // ─── 3. Busca vetorial vs FTS ──────────────────────────────────────
  print('\n[3/4] Comparando busca vetorial vs FTS...')

  const queries = [
    { query: 'indexar arquivos do projeto recursivamente', semantic: true },
    { query: 'calcular similaridade entre vetores float', semantic: true },
    { query: 'registrar ferramenta no agente', semantic: true },
    { query: 'createCodebaseIndexer', semantic: false }, // keyword — FTS deve dominar
  ]

  for (const { query, semantic } of queries) {
    const results = await indexer.search(query, 5)

    if (results.length === 0) {
      allPassed = check(`query "${query.slice(0, 40)}"`, false, '0 resultados') && allPassed
      continue
    }

    const vectorHits = results.filter((r) => r.source === 'vector' || r.source === 'hybrid')
    const ftsHits = results.filter((r) => r.source === 'fts')
    const top = results[0]

    print(`  query: "${query.slice(0, 50)}"`)
    print(`    top: ${top.chunk.filePath.split('/').slice(-3).join('/')}:${top.chunk.startLine}`)
    print(
      `    score=${top.score.toFixed(3)} source=${top.source} | vector:${vectorHits.length} fts:${ftsHits.length}`,
    )

    allPassed =
      check(
        `"${query.slice(0, 30)}..." retorna resultados`,
        results.length > 0,
        `${results.length} resultado(s)`,
      ) && allPassed

    if (semantic) {
      allPassed =
        check(
          `query semântica tem hits vetoriais`,
          vectorHits.length > 0,
          `${vectorHits.length} hits vetoriais`,
        ) && allPassed
    }
  }

  // ─── 4. Verificar scores híbridos ────────────────────────────────
  print('\n[4/4] Verificando scores híbridos...')

  const hybridResults = await indexer.search('busca semântica no código fonte TypeScript', 8)

  for (const r of hybridResults) {
    allPassed =
      check(
        `score ${r.chunk.filePath.split('/').slice(-1)[0]}:${r.chunk.startLine}`,
        r.score >= 0 && r.score <= 1,
        `score=${r.score.toFixed(3)} source=${r.source}`,
      ) && allPassed
  }

  const hasHybrid = hybridResults.some((r) => r.source === 'hybrid')
  const hasVector = hybridResults.some((r) => r.source === 'vector')
  allPassed =
    check(
      'Há resultados vetoriais ou híbridos',
      hasHybrid || hasVector,
      `hybrid=${hybridResults.filter((r) => r.source === 'hybrid').length} vector=${hybridResults.filter((r) => r.source === 'vector').length}`,
    ) && allPassed

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
