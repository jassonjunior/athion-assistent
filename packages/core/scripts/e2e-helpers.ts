/**
 * Helpers compartilhados para testes E2E de subagentes.
 * Evita duplicar bootstrap, validacao e formatacao em cada teste.
 */

import { resolve } from 'node:path'
import { bootstrap } from '../src/bootstrap'
import { createVllmManager } from '../src/server/vllm-manager'
import type { AthionCore } from '../src/bootstrap'
import type { OrchestratorEvent } from '../src/orchestrator/types'

const DIVIDER = '═'.repeat(60)
const LINE = '─'.repeat(60)

export function print(msg: string): void {
  console.log(msg)
}

export interface E2EResult {
  agentInvoked: boolean
  agentName: string | null
  toolCalls: Array<{ name: string; args: unknown }>
  toolResults: Array<{ name: string; success: boolean }>
  hasContent: boolean
  content: string
  hasFinish: boolean
  errors: string[]
}

export function createEmptyResult(): E2EResult {
  return {
    agentInvoked: false,
    agentName: null,
    toolCalls: [],
    toolResults: [],
    hasContent: false,
    content: '',
    hasFinish: false,
    errors: [],
  }
}

export async function setupCore(): Promise<{
  core: AthionCore
  vllm: ReturnType<typeof createVllmManager>
}> {
  print(`${DIVIDER}`)
  print('[1/3] Ensuring vllm-mlx is running...')
  const vllm = createVllmManager()
  await vllm.ensureRunning()
  print(`  ✓ vllm-mlx online at ${vllm.baseUrl}`)

  print('[2/3] Bootstrapping Athion core...')
  const core = await bootstrap({
    dbPath: '/tmp/athion-e2e-agents.db',
    skillsDir: resolve(import.meta.dir, '../skills'),
  })
  print(
    `  ✓ Tools: ${core.tools
      .list()
      .map((t) => t.name)
      .join(', ')}`,
  )
  print(
    `  ✓ SubAgents: ${core.subagents
      .list()
      .map((a) => a.name)
      .join(', ')}`,
  )
  print(`  ✓ Proxy: ${core.proxy ? core.proxy.url : 'disabled'}`)

  return { core, vllm }
}

export async function runAgentTest(
  core: AthionCore,
  testName: string,
  expectedAgent: string,
  userMessage: string,
): Promise<E2EResult> {
  const result = createEmptyResult()

  print(`\n${LINE}`)
  print(`  TEST: ${testName}`)
  print(`  Expected agent: ${expectedAgent}`)
  print(LINE)

  const session = await core.orchestrator.createSession('e2e-test', testName)
  print(`[0] session: ${session.id}`)

  const startTime = Date.now()
  const stream = core.orchestrator.chat(session.id, { content: userMessage })

  let counter = 0
  print(`[${counter}] user: ${userMessage.slice(0, 120)}`)
  counter++

  for await (const event of stream) {
    processEvent(event, result, counter)
    counter++
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  print(`\n  Duration: ${elapsed}s`)

  return result
}

function processEvent(event: OrchestratorEvent, result: E2EResult, counter: number): void {
  switch (event.type) {
    case 'content':
      result.hasContent = true
      result.content += event.content
      break
    case 'tool_call':
      print(`[${counter}] tool_call: ${event.name}(${JSON.stringify(event.args).slice(0, 200)})`)
      result.toolCalls.push({ name: event.name, args: event.args })
      break
    case 'tool_result': {
      const ok = event.result.success ? 'OK' : `ERROR: ${event.result.error}`
      print(`[${counter}] tool_result: ${event.name} → ${ok}`)
      result.toolResults.push({ name: event.name, success: event.result.success })
      break
    }
    case 'subagent_start':
      print(`[${counter}] subagent_start: ${event.agentName}`)
      result.agentInvoked = true
      result.agentName = event.agentName
      break
    case 'subagent_complete':
      print(`[${counter}] subagent_complete: ${event.agentName}`)
      break
    case 'finish':
      if (result.content) {
        print(`[${counter}] assistant: ${result.content.slice(0, 500)}`)
      }
      print(
        `[${counter + 1}] finish: ${event.usage.promptTokens} in / ${event.usage.completionTokens} out`,
      )
      result.hasFinish = true
      break
    case 'error':
      print(`[${counter}] error: ${event.error.message}`)
      result.errors.push(event.error.message)
      break
  }
}

export function validateResult(result: E2EResult, expectedAgent: string): boolean {
  print(`\n${LINE}`)
  print('  VALIDATION')
  print(LINE)

  let pass = true

  const checks = [
    { label: 'Agent invoked', ok: result.agentInvoked },
    { label: `Correct agent (${expectedAgent})`, ok: result.agentName === expectedAgent },
    { label: 'Tool calls made', ok: result.toolCalls.length > 0 },
    { label: 'Tool results received', ok: result.toolResults.length > 0 },
    { label: 'All tools succeeded', ok: result.toolResults.every((r) => r.success) },
    { label: 'Has content response', ok: result.hasContent },
    { label: 'Stream finished', ok: result.hasFinish },
    { label: 'No errors', ok: result.errors.length === 0 },
  ]

  for (const check of checks) {
    const icon = check.ok ? '✓' : '✗'
    print(`  ${icon} ${check.label}`)
    if (!check.ok) pass = false
  }

  print(`\n  ${pass ? 'PASSED ✓' : 'FAILED ✗'}`)
  print(DIVIDER)
  return pass
}

export function cleanup(vllm: ReturnType<typeof createVllmManager>): void {
  vllm.stop()
}
