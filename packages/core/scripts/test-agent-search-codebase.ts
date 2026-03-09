/**
 * E2E Test: Search Agent com search_codebase
 * Valida que o agente 'search' usa a tool search_codebase (além de search_files)
 * quando um workspace indexado é fornecido no bootstrap.
 */

import { resolve } from 'node:path'
import { bootstrap } from '../src/bootstrap'
import { createVllmManager } from '../src/server/vllm-manager'
import { print, runAgentTest, validateResult, cleanup } from './e2e-helpers'

const WORKSPACE = resolve(import.meta.dir, '../../../')
const INDEX_DB = '/tmp/athion-e2e-codebase.db'

// Mensagem que direciona o agente a usar busca semântica
const USER_MESSAGE =
  'Use search_codebase to find the implementation of the CodebaseIndexer class. ' +
  'Then use search_codebase to find how indexWorkspace works. ' +
  'Report which files were found and what tools you used.'

const DIVIDER = '═'.repeat(60)
const LINE = '─'.repeat(60)

async function main() {
  print(DIVIDER)
  print('  TEST: Search Agent + search_codebase E2E')
  print(DIVIDER)

  print('\n[1/3] Ensuring vllm-mlx is running...')
  const vllm = createVllmManager()
  await vllm.ensureRunning()
  print(`  ✓ vllm-mlx online at ${vllm.baseUrl}`)

  print('\n[2/3] Bootstrapping core WITH workspace (search_codebase enabled)...')
  print(`  workspace: ${WORKSPACE}`)
  print(`  indexDb: ${INDEX_DB}`)

  const core = await bootstrap({
    dbPath: '/tmp/athion-e2e-agents-codebase.db',
    skillsDir: resolve(import.meta.dir, '../skills'),
    workspacePath: WORKSPACE,
    indexDbPath: INDEX_DB,
  })

  const toolNames = core.tools.list().map((t) => t.name)
  print(`  ✓ Tools: ${toolNames.join(', ')}`)

  const hasSearchCodebase = toolNames.includes('search_codebase')
  print(
    `  ${hasSearchCodebase ? '✓' : '✗'} search_codebase ${hasSearchCodebase ? 'registrada' : 'NÃO registrada!'}`,
  )

  if (!hasSearchCodebase) {
    print('\n  FAILED ✗ — search_codebase não foi registrada. Verifique bootstrap.ts')
    cleanup(vllm)
    process.exit(1)
  }

  // Pré-indexar o workspace para que search_codebase tenha dados
  if (core.indexer) {
    print('\n[2.5/3] Pré-indexando workspace...')
    const stats = await core.indexer.indexWorkspace((indexed, total) => {
      if (indexed % 50 === 0 || indexed === total) {
        print(`  ... ${indexed}/${total}`)
      }
    })
    print(`  ✓ Indexados: ${stats.totalFiles} arquivos, ${stats.totalChunks} chunks`)
    // Aguardar o servidor recuperar após burst de embedding requests
    print('  ... aguardando servidor (3s)...')
    await new Promise((r) => setTimeout(r, 3000))
  }

  print('\n[3/3] Running search agent test...')
  const result = await runAgentTest(core, 'Search Agent + search_codebase', 'search', USER_MESSAGE)

  // Validação adicional: verificar se search_codebase foi chamada
  print(`\n${LINE}`)
  print('  EXTRA CHECKS')
  print(LINE)

  // search_codebase é chamada DENTRO do subagente — verificar no conteúdo final
  const contentMentionsSearchCodebase = result.content.includes('search_codebase')
  const usedSearchFiles = result.toolCalls.some((t) => t.name === 'search_files')

  print(
    `  ${contentMentionsSearchCodebase ? '✓' : '~'} search_codebase mencionada na resposta (chamada dentro do subagente)`,
  )
  print(
    `  ${usedSearchFiles ? '~' : '✓'} search_files ${usedSearchFiles ? 'também usada (fallback)' : 'não usada (ótimo!)'}`,
  )

  if (result.toolCalls.length > 0) {
    print('\n  Tool calls do orchestrator:')
    for (const tc of result.toolCalls) {
      const args = JSON.stringify(tc.args).slice(0, 100)
      print(`    → ${tc.name}(${args})`)
    }
  }

  const passed = validateResult(result, 'search')
  cleanup(vllm)
  process.exit(passed ? 0 : 1)
}

main().catch((err) => {
  print(`Fatal: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
