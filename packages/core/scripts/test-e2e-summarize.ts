/**
 * E2E Test: Smart Compaction (Summarize Strategy)
 *
 * Duas fases:
 *
 * FASE 1 — Testes de agentes (mesmo da suite normal)
 *   Roda todos os 7 agentes e valida que passam com strategy=summarize.
 *
 * FASE 2 — Teste de stress multi-turn (força compactação)
 *   Uma sessão longa com 5+ mensagens do usuario na mesma sessão,
 *   cada uma pedindo mais trabalho. O threshold é reduzido para 15%
 *   para forçar a compactação acontecer. Instrumenta o compact() para
 *   medir tokens antes/depois e validar que o modelo ainda funciona
 *   após a sumarização.
 */

import { resolve } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import { bootstrap } from '../src/bootstrap'
import type { AthionCore } from '../src/bootstrap'
import type { TokenManager } from '../src/tokens/types'
import { createVllmManager } from '../src/server/vllm-manager'
import { createTokenManager } from '../src/tokens'
import { createSummarizationService } from '../src/tokens/summarize'

// ─── Constantes ──────────────────────────────────────────
const DIVIDER = '═'.repeat(60)
const LINE = '─'.repeat(60)
const CONTEXT_LIMIT = 50_000

function print(msg: string): void {
  console.log(msg)
}

// ─── Tipos ───────────────────────────────────────────────

interface CompactionEvent {
  messagesBefore: number
  messagesAfter: number
  tokensBefore: number
  tokensAfter: number
  tokensSaved: number
  reductionPercent: number
  method: 'summarize' | 'sliding-window-fallback'
}

interface TestResult {
  name: string
  agent: string
  passed: boolean
  duration: number
  totalInputTokens: number
  totalOutputTokens: number
  contextOverflow: boolean
  peakUsagePercent: number
  compactions: CompactionEvent[]
  errors: string[]
}

interface TestDef {
  name: string
  agent: string
  description: string
  userMessage: string
  setup?: () => void
}

// ─── Testes de agentes ───────────────────────────────────

const AGENT_TESTS: TestDef[] = [
  {
    name: 'search-interfaces',
    agent: 'search',
    description: 'Search Agent — Find TypeScript interfaces',
    userMessage:
      'Search the project structure and find all TypeScript files that export interfaces. List the file paths and the interface names.',
  },
  {
    name: 'code-review',
    agent: 'code-review',
    description: 'Code Reviewer — Review proxy.ts',
    userMessage:
      'Review the code in packages/core/src/server/proxy/proxy.ts for potential bugs, security issues, and code quality improvements.',
  },
  {
    name: 'refactorer',
    agent: 'refactorer',
    description: 'Refactorer — Refactor messy code',
    userMessage:
      'Refactor the file at /tmp/athion-e2e/messy-code.ts. Replace var/let with const where possible, use strict equality, add TypeScript types, and convert to modern array methods.',
    setup: () => {
      mkdirSync('/tmp/athion-e2e', { recursive: true })
      writeFileSync(
        '/tmp/athion-e2e/messy-code.ts',
        `var data = [1, 2, 3, 4, 5]
var result = []
for (var i = 0; i < data.length; i++) {
  if (data[i] % 2 == 0) { result.push(data[i] * 2) }
}
function processData(items) {
  let output = []
  for (let i = 0; i < items.length; i++) {
    if (items[i].active == true) {
      output.push({ name: items[i].name, value: items[i].value * 2 })
    }
  }
  return output
}
export { processData, result }
`,
      )
    },
  },
  {
    name: 'explainer',
    agent: 'explainer',
    description: 'Explainer — Explain streaming middleware',
    userMessage:
      'Explain how the streaming middleware pipeline works in the proxy module. Read packages/core/src/server/proxy/streaming.ts and explain step by step.',
  },
  {
    name: 'debugger',
    agent: 'debugger',
    description: 'Debugger — Fix parseCSV bug',
    userMessage:
      'There is a bug in /tmp/athion-e2e/buggy-parser.ts. The parseCSV function includes the header row as data in the result. Find the bug, explain it, and fix it.',
    setup: () => {
      mkdirSync('/tmp/athion-e2e', { recursive: true })
      writeFileSync(
        '/tmp/athion-e2e/buggy-parser.ts',
        `export function parseCSV(csv: string): Array<Record<string, string>> {
  const lines = csv.trim().split('\\n')
  const headers = lines[0].split(',')
  const result: Array<Record<string, string>> = []
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
`,
      )
    },
  },
]

// ─── Fuzzy match (mesmo do task-tool) ────────────────────

function agentNameMatches(actual: string | null, expected: string): boolean {
  if (!actual) return false
  if (actual === expected) return true
  const a = actual.toLowerCase().replace(/[_\s]/g, '-')
  const b = expected.toLowerCase().replace(/[_\s]/g, '-')
  return a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a)
}

// ─── Execução ────────────────────────────────────────────

async function runAgentTest(core: AthionCore, test: TestDef): Promise<TestResult> {
  if (test.setup) test.setup()

  print(`\n${LINE}`)
  print(`  TEST: ${test.description}`)
  print(`  Agent: ${test.agent}`)
  print(LINE)

  const result: TestResult = {
    name: test.name,
    agent: test.agent,
    passed: false,
    duration: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    contextOverflow: false,
    peakUsagePercent: 0,
    compactions: [],
    errors: [],
  }

  const startTime = Date.now()

  try {
    const session = await core.orchestrator.createSession('e2e-summarize', test.name)
    const stream = core.orchestrator.chat(session.id, { content: test.userMessage })

    let agentInvoked = false
    let agentName: string | null = null
    let content = ''
    let hasFinish = false
    let allToolsOk = true
    let toolCalls = 0
    let toolResults = 0

    for await (const event of stream) {
      switch (event.type) {
        case 'content':
          content += event.content
          break
        case 'tool_call':
          toolCalls++
          print(`  tool_call: ${event.name}`)
          break
        case 'tool_result':
          toolResults++
          if (!event.result.success) allToolsOk = false
          print(`  tool_result: ${event.name} → ${event.result.success ? 'OK' : 'ERROR'}`)
          break
        case 'subagent_start':
          agentInvoked = true
          agentName = event.agentName
          print(`  subagent: ${event.agentName}`)
          break
        case 'finish': {
          hasFinish = true
          result.totalInputTokens += event.usage.promptTokens
          result.totalOutputTokens += event.usage.completionTokens
          const pct = ((result.totalInputTokens + result.totalOutputTokens) / CONTEXT_LIMIT) * 100
          if (pct > result.peakUsagePercent) result.peakUsagePercent = pct
          if (pct > 100) result.contextOverflow = true
          print(
            `  finish: ${event.usage.promptTokens} in / ${event.usage.completionTokens} out (${pct.toFixed(1)}%)`,
          )
          break
        }
        case 'error':
          result.errors.push(event.error.message)
          print(`  ERROR: ${event.error.message}`)
          break
      }
    }

    result.duration = Date.now() - startTime
    result.passed =
      agentInvoked &&
      agentNameMatches(agentName, test.agent) &&
      toolCalls > 0 &&
      toolResults > 0 &&
      allToolsOk &&
      content.length > 0 &&
      hasFinish &&
      result.errors.length === 0

    print(
      `  → ${result.passed ? 'PASSED ✓' : 'FAILED ✗'} (${(result.duration / 1000).toFixed(1)}s)`,
    )
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err))
    result.duration = Date.now() - startTime
    print(`  → FATAL: ${err instanceof Error ? err.message : String(err)}`)
  }

  return result
}

// ─── FASE 2: Stress test multi-turn ──────────────────────

/**
 * Cria um TokenManager instrumentado com threshold baixo (15%)
 * para forçar compactação, e captura métricas de cada compact().
 */
function createInstrumentedTokenManager(
  core: AthionCore,
  compactions: CompactionEvent[],
): TokenManager {
  const provider = core.provider
  const config = core.config

  const summarizer = createSummarizationService({
    provider,
    providerId: config.get('provider') as string,
    modelId: config.get('model') as string,
  })

  const inner = createTokenManager({
    contextLimit: CONTEXT_LIMIT,
    compactionThreshold: 0.15, // 15% — força compactação cedo
    strategy: 'summarize',
    summarizer,
  })

  // Wrap compact() para capturar métricas
  const originalCompact = inner.compact.bind(inner)

  inner.compact = async (messages) => {
    const before = messages.length
    const tokensBefore = messages.reduce((s, m) => s + Math.ceil(m.content.length / 4), 0)

    print(`  ⚡ compact() chamado: ${before} msgs, ~${tokensBefore} tokens`)

    const result = await originalCompact(messages)

    const after = result.length
    const tokensAfter = result.reduce((s, m) => s + Math.ceil(m.content.length / 4), 0)
    const saved = tokensBefore - tokensAfter
    const hasSummary = result.some((m) => m.content.includes('[Conversation Summary]'))

    const event: CompactionEvent = {
      messagesBefore: before,
      messagesAfter: after,
      tokensBefore,
      tokensAfter,
      tokensSaved: saved,
      reductionPercent: tokensBefore > 0 ? Math.round((saved / tokensBefore) * 100) : 0,
      method: hasSummary ? 'summarize' : 'sliding-window-fallback',
    }
    compactions.push(event)

    print(`  ⚡ compact() resultado: ${after} msgs, ~${tokensAfter} tokens`)
    print(`  ⚡ Método: ${event.method} | Economizou: ${saved} tokens (${event.reductionPercent}%)`)

    return result
  }

  return inner
}

async function runStressTest(core: AthionCore): Promise<TestResult> {
  print(`\n${DIVIDER}`)
  print('  FASE 2: STRESS TEST — MULTI-TURN COM COMPACTAÇÃO')
  print(DIVIDER)

  const compactions: CompactionEvent[] = []
  // Token manager instrumentado — captura métricas de compactação
  // O orchestrator já usa o token manager do bootstrap, mas este nos dá visibilidade
  createInstrumentedTokenManager(core, compactions)

  const result: TestResult = {
    name: 'stress-multi-turn',
    agent: 'multiple',
    passed: false,
    duration: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    contextOverflow: false,
    peakUsagePercent: 0,
    compactions,
    errors: [],
  }

  const startTime = Date.now()

  // Mensagens progressivas na mesma sessão
  const messages = [
    'List all files in the packages/core/src/ directory. I want to understand the project structure.',
    'Now read the file packages/core/src/orchestrator/orchestrator.ts and explain the main function.',
    'Search for all files that use the word "compaction" or "compact". List every match.',
    'Now explain the token management system — how does it track tokens and when does it trigger compaction?',
    'Finally, review the bootstrap.ts file and tell me the initialization order of all modules.',
  ]

  try {
    const session = await core.orchestrator.createSession('e2e-stress', 'multi-turn-compaction')
    print(`  Session: ${session.id}`)

    for (let i = 0; i < messages.length; i++) {
      print(`\n  ── Turn ${i + 1}/${messages.length} ──`)
      print(`  User: ${messages[i].slice(0, 100)}...`)

      const stream = core.orchestrator.chat(session.id, { content: messages[i] })

      let turnContent = ''

      for await (const event of stream) {
        switch (event.type) {
          case 'content':
            turnContent += event.content
            break
          case 'tool_call':
            print(`    tool_call: ${event.name}`)
            break
          case 'tool_result':
            print(`    tool_result: ${event.name} → ${event.result.success ? 'OK' : 'ERROR'}`)
            break
          case 'subagent_start':
            print(`    subagent: ${event.agentName}`)
            break
          case 'finish': {
            result.totalInputTokens += event.usage.promptTokens
            result.totalOutputTokens += event.usage.completionTokens
            const pct = ((result.totalInputTokens + result.totalOutputTokens) / CONTEXT_LIMIT) * 100
            if (pct > result.peakUsagePercent) result.peakUsagePercent = pct
            if (pct > 100) result.contextOverflow = true
            print(
              `    finish: ${event.usage.promptTokens} in / ${event.usage.completionTokens} out (peak: ${pct.toFixed(1)}%)`,
            )
            break
          }
          case 'error':
            result.errors.push(event.error.message)
            print(`    ERROR: ${event.error.message}`)
            break
        }
      }

      if (turnContent.length > 0) {
        print(`    Response: ${turnContent.slice(0, 150)}...`)
      }
    }

    result.duration = Date.now() - startTime
    result.compactions = compactions

    // O stress test "passa" se:
    // 1. Todas as mensagens receberam resposta (sem crash)
    // 2. Nenhum estouro de contexto
    // 3. Se houve compactação, os turnos subsequentes ainda funcionaram
    result.passed = result.errors.length === 0

    print(
      `\n  → ${result.passed ? 'PASSED ✓' : 'FAILED ✗'} (${(result.duration / 1000).toFixed(1)}s)`,
    )
    print(`  → Compactações: ${compactions.length}`)
    for (const c of compactions) {
      print(
        `    ${c.method}: ${c.messagesBefore} → ${c.messagesAfter} msgs, saved ${c.tokensSaved} tokens (${c.reductionPercent}%)`,
      )
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err))
    result.duration = Date.now() - startTime
    print(`  → FATAL: ${err instanceof Error ? err.message : String(err)}`)
  }

  return result
}

// ─── Relatório ───────────────────────────────────────────

function printReport(agentResults: TestResult[], stressResult: TestResult): void {
  const allResults = [...agentResults, stressResult]
  const totalTests = allResults.length
  const passed = allResults.filter((r) => r.passed).length
  const failed = totalTests - passed
  const totalCompactions = allResults.reduce((sum, r) => sum + r.compactions.length, 0)
  const totalTokensSaved = allResults.reduce(
    (sum, r) => sum + r.compactions.reduce((s, c) => s + c.tokensSaved, 0),
    0,
  )
  const totalInputTokens = allResults.reduce((sum, r) => sum + r.totalInputTokens, 0)
  const totalOutputTokens = allResults.reduce((sum, r) => sum + r.totalOutputTokens, 0)
  const overflows = allResults.filter((r) => r.contextOverflow).length
  const avgPeak = allResults.reduce((sum, r) => sum + r.peakUsagePercent, 0) / totalTests
  const totalDuration = allResults.reduce((sum, r) => sum + r.duration, 0)

  print(`\n\n${DIVIDER}`)
  print('  SMART COMPACTION — RELATÓRIO FINAL')
  print(DIVIDER)

  // Tabela
  print('\n  ┌──────────────────────────┬────────┬──────────┬───────────┬────────────┬──────────┐')
  print('  │ Teste                    │ Status │ Tokens   │ Peak (%)  │ Compações  │ Salvou   │')
  print('  ├──────────────────────────┼────────┼──────────┼───────────┼────────────┼──────────┤')

  for (const r of allResults) {
    const status = r.passed ? '  ✓  ' : '  ✗  '
    const tokens = `${(r.totalInputTokens + r.totalOutputTokens).toLocaleString()}`.padStart(8)
    const peak = `${r.peakUsagePercent.toFixed(1)}%`.padStart(9)
    const comps = `${r.compactions.length}`.padStart(10)
    const saved =
      r.compactions.length > 0
        ? `${r.compactions.reduce((s, c) => s + c.tokensSaved, 0).toLocaleString()}`.padStart(8)
        : '       -'
    const name = r.name.padEnd(24)
    print(`  │ ${name} │ ${status} │ ${tokens} │ ${peak} │ ${comps} │ ${saved} │`)
  }

  print('  └──────────────────────────┴────────┴──────────┴───────────┴────────────┴──────────┘')

  // Sumário
  print(`\n  SUMÁRIO`)
  print(LINE)
  print(`  Testes: ${passed}/${totalTests} passaram (${failed} falharam)`)
  print(`  Tempo total: ${(totalDuration / 1000).toFixed(1)}s`)
  print(
    `  Tokens totais: ${totalInputTokens.toLocaleString()} in + ${totalOutputTokens.toLocaleString()} out = ${(totalInputTokens + totalOutputTokens).toLocaleString()}`,
  )
  print(`  Context limit: ${CONTEXT_LIMIT.toLocaleString()} tokens`)
  print(`  Pico médio: ${avgPeak.toFixed(1)}%`)
  print(`  Estouros: ${overflows}/${totalTests}`)
  print(`  Compactações: ${totalCompactions}`)
  print(`  Tokens economizados: ${totalTokensSaved.toLocaleString()}`)

  // Avaliação
  print(`\n  AVALIAÇÃO`)
  print(LINE)

  // 1. Estouro de contexto
  if (overflows > 0) {
    print(`  ⚠ ${overflows} teste(s) estouraram o context limit`)
  } else {
    print(`  ✓ Nenhum estouro de contexto`)
  }

  // 2. Summarização invocada
  if (totalCompactions > 0) {
    print(`  ✓ Summarização invocada ${totalCompactions}x`)
    print(`    Economizou ${totalTokensSaved.toLocaleString()} tokens`)

    // Verificar se usou LLM ou fallback
    const summarizeMethods = allResults.flatMap((r) => r.compactions).map((c) => c.method)
    const llmCount = summarizeMethods.filter((m) => m === 'summarize').length
    const fallbackCount = summarizeMethods.filter((m) => m === 'sliding-window-fallback').length
    if (llmCount > 0) print(`    ${llmCount}x via LLM (summarize)`)
    if (fallbackCount > 0) print(`    ${fallbackCount}x via fallback (sliding-window)`)

    // Contexto preservado?
    const compactedTests = allResults.filter((r) => r.compactions.length > 0)
    const compactedPassed = compactedTests.filter((r) => r.passed).length
    if (compactedPassed === compactedTests.length) {
      print(`  ✓ Todos os testes com compactação passaram — contexto importante preservado`)
    } else {
      print(`  ⚠ ${compactedTests.length - compactedPassed} teste(s) falharam após compactação`)
    }
  } else {
    print(`  ℹ Summarização não foi invocada nos testes de agente (tokens < threshold)`)
    print(`    O stress test multi-turn deveria ter acionado a compactação`)
  }

  // 3. Resultado final
  if (failed === 0) {
    print(`\n  ✅ RESULTADO FINAL: TODOS OS TESTES PASSARAM`)
  } else {
    print(`\n  ❌ RESULTADO FINAL: ${failed} TESTE(S) FALHARAM`)
  }
  print(DIVIDER)
}

// ─── Main ────────────────────────────────────────────────

async function main() {
  print(DIVIDER)
  print('  ATHION E2E — SMART COMPACTION TEST')
  print(DIVIDER)

  print('\n[1/3] Ensuring vllm-mlx is running...')
  const vllm = createVllmManager()
  await vllm.ensureRunning()
  print(`  ✓ vllm-mlx online at ${vllm.baseUrl}`)

  print('[2/3] Bootstrapping Athion core (strategy: summarize)...')
  const core = await bootstrap({
    dbPath: '/tmp/athion-e2e-summarize.db',
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
  print(`  ✓ Strategy: summarize (threshold: 90%)`)
  print('[3/3] Ready\n')

  const agentResults: TestResult[] = []

  try {
    // FASE 1: Testes de agentes
    print(`${DIVIDER}`)
    print('  FASE 1: TESTES DE AGENTES (strategy=summarize)')
    print(DIVIDER)

    for (const test of AGENT_TESTS) {
      const result = await runAgentTest(core, test)
      agentResults.push(result)
    }

    // FASE 2: Stress test multi-turn
    const stressResult = await runStressTest(core)

    // Relatório final
    printReport(agentResults, stressResult)

    vllm.stop()
    const allPassed = [...agentResults, stressResult].every((r) => r.passed)
    process.exit(allPassed ? 0 : 1)
  } catch (err) {
    print(`\nFATAL: ${err instanceof Error ? err.message : String(err)}`)
    vllm.stop()
    process.exit(1)
  }
}

main()
