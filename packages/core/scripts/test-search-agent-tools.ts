/**
 * Smoke Test: Verifica que search_codebase está disponível para o search agent
 * sem precisar do LLM — apenas valida bootstrap + tool registry.
 */

import { resolve } from 'node:path'
import { bootstrap } from '../src/bootstrap'

const WORKSPACE = resolve(import.meta.dir, '../../../')
const DIVIDER = '═'.repeat(60)
const LINE = '─'.repeat(60)

function print(msg: string) {
  console.log(msg)
}
function check(label: string, ok: boolean, detail?: string) {
  print(`  ${ok ? '✓' : '✗'} ${label}${detail ? `: ${detail}` : ''}`)
  return ok
}

async function main() {
  print(DIVIDER)
  print('  SMOKE TEST: search_codebase disponível para search agent')
  print(DIVIDER)

  let allPassed = true

  // Bootstrap sem workspacePath — search_codebase NÃO deve ser registrada
  print('\n[1/2] Bootstrap SEM workspacePath...')
  const core1 = await bootstrap({
    dbPath: '/tmp/athion-smoke-test-1.db',
    skillsDir: resolve(import.meta.dir, '../skills'),
  })

  const tools1 = core1.tools.list().map((t) => t.name)
  print(`  Tools: ${tools1.join(', ')}`)
  allPassed =
    check('search_codebase NÃO registrada sem workspace', !tools1.includes('search_codebase')) &&
    allPassed
  allPassed = check('indexer é null sem workspace', core1.indexer === null) && allPassed

  // Bootstrap COM workspacePath — search_codebase DEVE ser registrada
  print('\n[2/2] Bootstrap COM workspacePath...')
  const core2 = await bootstrap({
    dbPath: '/tmp/athion-smoke-test-2.db',
    skillsDir: resolve(import.meta.dir, '../skills'),
    workspacePath: WORKSPACE,
    indexDbPath: '/tmp/athion-smoke-index.db',
  })

  const tools2 = core2.tools.list().map((t) => t.name)
  print(`  Tools: ${tools2.join(', ')}`)
  allPassed =
    check('search_codebase registrada com workspace', tools2.includes('search_codebase')) &&
    allPassed
  allPassed = check('indexer não é null com workspace', core2.indexer !== null) && allPassed

  // Verificar que search agent lista search_codebase nas suas tools
  const searchAgentDef = core2.subagents.list().find((a) => a.name === 'search')
  allPassed = check('search agent existe', searchAgentDef !== undefined) && allPassed

  if (searchAgentDef) {
    print(`  search agent tools: ${searchAgentDef.tools.join(', ')}`)
    allPassed =
      check(
        'search agent tem search_codebase na config',
        searchAgentDef.tools.includes('search_codebase'),
      ) && allPassed
    allPassed =
      check(
        'search_codebase é 1ª tool do search agent',
        searchAgentDef.tools[0] === 'search_codebase',
      ) && allPassed
  }

  // Verificar que a tool está resolvível no registry (como o agent.ts faz)
  const allowedTools = core2.tools.list().filter((t) => searchAgentDef?.tools.includes(t.name))
  print(`  Tools resolvidas para search agent: ${allowedTools.map((t) => t.name).join(', ')}`)
  allPassed =
    check(
      'search_codebase resolvida do registry para search agent',
      allowedTools.some((t) => t.name === 'search_codebase'),
    ) && allPassed

  // Verificar execução direta da tool search_codebase via registry
  print('\n  Executando search_codebase via registry...')
  // Indexar primeiro para ter dados
  if (core2.indexer) {
    await core2.indexer.indexWorkspace()
    const toolResult = await core2.tools.execute('search_codebase', {
      query: 'bootstrap',
      limit: 3,
    })
    allPassed =
      check('Execução via registry bem-sucedida', toolResult.success === true) && allPassed

    if (toolResult.success && toolResult.data) {
      const data = toolResult.data as { results: unknown[] }
      allPassed =
        check(
          'Retorna resultados',
          Array.isArray(data.results) && data.results.length > 0,
          `${data.results.length} resultado(s)`,
        ) && allPassed
    }
    core2.indexer.close()
  }

  core1.indexer?.close()

  print(`\n${LINE}`)
  print(`  ${allPassed ? 'PASSED ✓' : 'FAILED ✗'}`)
  print(DIVIDER)
  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
