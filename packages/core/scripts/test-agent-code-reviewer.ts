/**
 * E2E Test: SubAgent Code Reviewer
 * Valida que o agente 'code-review' é invocado, lê arquivos de codigo,
 * e retorna uma analise com bugs, problemas de segurança ou melhorias.
 */

import { setupCore, runAgentTest, validateResult, cleanup, print } from './e2e-helpers'

const AGENT = 'code-review'
const USER_MESSAGE =
  'Review the code in packages/core/src/server/proxy/proxy.ts for potential bugs, ' +
  'security issues, and code quality improvements. ' +
  'Use the code-review agent to do a thorough analysis and provide a detailed report.'

async function main() {
  const { core, vllm } = await setupCore()

  try {
    const result = await runAgentTest(core, 'Code Reviewer Agent E2E', AGENT, USER_MESSAGE)
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
