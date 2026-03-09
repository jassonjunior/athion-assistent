/**
 * E2E Test: SubAgent Debugger
 * Valida que o agente 'debugger' é invocado, lê codigo com bug,
 * diagnostica o problema e aplica a correção.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { setupCore, runAgentTest, validateResult, cleanup, print } from './e2e-helpers'

const AGENT = 'debugger'

// Cria arquivo temporario com bug proposital
const TEMP_FILE = '/tmp/athion-e2e/buggy-parser.ts'
const BUGGY_CODE = `
/** Parses a CSV string into an array of objects using the first row as headers. */
export function parseCSV(csv: string): Record<string, string>[] {
  const lines = csv.split('\\n')
  const headers = lines[0].split(',')
  const result: Record<string, string>[] = []

  // BUG: starts at index 0 instead of 1, so headers row is included as data
  for (let i = 0; i < lines.length; i++) {
    const values = lines[i].split(',')
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j]
    }
    result.push(row)
  }

  return result
}

// Expected: parseCSV("name,age\\nAlice,30\\nBob,25") should return:
// [{ name: "Alice", age: "30" }, { name: "Bob", age: "25" }]
// Actual: returns 3 items including { name: "name", age: "age" }
`

const USER_MESSAGE =
  `There is a bug in ${TEMP_FILE}. The parseCSV function includes the header row ` +
  'as data in the result. It should start iterating from index 1 to skip headers, ' +
  'but it starts from 0. Use the debugger agent to investigate the file, ' +
  'diagnose the bug, and apply the minimal fix.'

async function main() {
  mkdirSync('/tmp/athion-e2e', { recursive: true })
  writeFileSync(TEMP_FILE, BUGGY_CODE)
  print(`Created temp file: ${TEMP_FILE}`)

  const { core, vllm } = await setupCore()

  try {
    const result = await runAgentTest(core, 'Debugger Agent E2E', AGENT, USER_MESSAGE)
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
