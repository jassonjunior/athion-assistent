/**
 * E2E Test: SubAgent Test Writer
 * Valida que o agente 'test-writer' é invocado, lê codigo existente,
 * e escreve testes unitarios em arquivo temporario.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { setupCore, runAgentTest, validateResult, cleanup, print } from './e2e-helpers'

const AGENT = 'test-writer'

// Cria arquivo temporario com codigo para testar
const TEMP_FILE = '/tmp/athion-e2e/calculator.ts'
const SOURCE_CODE = `
export function add(a: number, b: number): number {
  return a + b
}

export function subtract(a: number, b: number): number {
  return a - b
}

export function multiply(a: number, b: number): number {
  return a * b
}

export function divide(a: number, b: number): number {
  if (b === 0) throw new Error('Division by zero')
  return a / b
}
`

const USER_MESSAGE =
  `Write unit tests for the calculator module at ${TEMP_FILE}. ` +
  'Create a test file at /tmp/athion-e2e/calculator.test.ts that covers all functions: ' +
  'add, subtract, multiply, and divide (including the division by zero edge case). ' +
  'Use the test-writer agent to generate comprehensive tests.'

async function main() {
  mkdirSync('/tmp/athion-e2e', { recursive: true })
  writeFileSync(TEMP_FILE, SOURCE_CODE)
  print(`Created temp file: ${TEMP_FILE}`)

  const { core, vllm } = await setupCore()

  try {
    const result = await runAgentTest(core, 'Test Writer Agent E2E', AGENT, USER_MESSAGE)
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
