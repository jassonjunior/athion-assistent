/**
 * E2E Test: SubAgent Coder
 * Valida que o agente 'coder' é invocado, executa tools (read_file, write_file),
 * e gera codigo novo em um arquivo temporario.
 */

import { setupCore, runAgentTest, validateResult, cleanup, print } from './e2e-helpers'

const AGENT = 'coder'
const USER_MESSAGE =
  'Create a new TypeScript utility file at /tmp/athion-e2e/debounce.ts that implements ' +
  'a generic debounce function with proper TypeScript types. ' +
  'Use the coder agent to write the implementation from scratch.'

async function main() {
  const { core, vllm } = await setupCore()

  try {
    const result = await runAgentTest(core, 'Coder Agent E2E', AGENT, USER_MESSAGE)
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
