/**
 * E2E Test: SubAgent Explainer
 * Valida que o agente 'explainer' é invocado, lê arquivos de codigo,
 * e retorna uma explicacao clara e estruturada.
 */

import { setupCore, runAgentTest, validateResult, cleanup, print } from './e2e-helpers'

const AGENT = 'explainer'
const USER_MESSAGE =
  'Explain how the streaming middleware pipeline works in the proxy module. ' +
  'Read packages/core/src/server/proxy/streaming.ts and explain step by step: ' +
  'what each function does, how chunks flow through middlewares, and how tool calls are extracted. ' +
  'Use the explainer agent to provide a clear, structured explanation.'

async function main() {
  const { core, vllm } = await setupCore()

  try {
    const result = await runAgentTest(core, 'Explainer Agent E2E', AGENT, USER_MESSAGE)
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
