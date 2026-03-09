/**
 * E2E Test: SubAgent Refactorer
 * Valida que o agente 'refactorer' é invocado, lê e reescreve arquivo,
 * fazendo mudanças estruturais preservando comportamento.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { setupCore, runAgentTest, validateResult, cleanup, print } from './e2e-helpers'

const AGENT = 'refactorer'

// Cria arquivo temporario com codigo para refatorar
const TEMP_FILE = '/tmp/athion-e2e/messy-code.ts'
const MESSY_CODE = `
export function processData(data: any) {
  let result = []
  for (let i = 0; i < data.length; i++) {
    if (data[i].active == true) {
      let item = { name: data[i].name, value: data[i].value * 2 }
      result.push(item)
    }
  }
  return result
}

export function formatOutput(items: any) {
  let output = ''
  for (let i = 0; i < items.length; i++) {
    output = output + items[i].name + ': ' + items[i].value + '\\n'
  }
  return output
}
`

const USER_MESSAGE =
  `Refactor the file at ${TEMP_FILE}. ` +
  'Replace var/let with const where possible, use strict equality, ' +
  'add proper TypeScript types, and use modern array methods like .filter() and .map(). ' +
  'Use the refactorer agent to make surgical improvements while preserving behavior.'

async function main() {
  mkdirSync('/tmp/athion-e2e', { recursive: true })
  writeFileSync(TEMP_FILE, MESSY_CODE)
  print(`Created temp file: ${TEMP_FILE}`)

  const { core, vllm } = await setupCore()

  try {
    const result = await runAgentTest(core, 'Refactorer Agent E2E', AGENT, USER_MESSAGE)
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
