/**
 * E2E Test: SubAgent Search
 * Valida que o agente 'search' é invocado, executa tools (read_file, list_files, search_files),
 * e retorna uma resposta final com os resultados da busca.
 */

import { setupCore, runAgentTest, validateResult, cleanup, print } from './e2e-helpers'

const AGENT = 'search'
const USER_MESSAGE =
  'Search the project structure and find all TypeScript files that export interfaces. ' +
  'List the file paths and the interface names you find. ' +
  'Use the search agent to investigate the codebase thoroughly.'

async function main() {
  const { core, vllm } = await setupCore()

  try {
    const result = await runAgentTest(core, 'Search Agent E2E', AGENT, USER_MESSAGE)
    const passed = validateResult(result, AGENT)
    cleanup(vllm)
    process.exit(passed ? 0 : 1)
  } catch (err) {
    print(`Fatal: ${err instanceof Error ? err.message : String(err)}`)
    cleanup(vllm)
    process.exit(1)
  }
}

main()
