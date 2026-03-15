/**
 * Test Runner instrumentado para o observability-athion.
 * Faz bootstrap do core com SubAgentManager instrumentado
 * para capturar eventos granulares do subagente.
 */

import { resolve } from 'node:path'
import { bootstrap } from '../../../core/src/bootstrap'
import type { AthionCore } from '../../../core/src/bootstrap'
import type { OrchestratorEvent } from '../../../core/src/orchestrator/types'
import type { SubAgentEvent } from '../../../core/src/subagent/types'
import type { TestInfo, TokenSnapshot, WsServerMessage } from './protocol'
import { truncatePreview } from './protocol'

/** Definição de um teste */
export interface TestDefinition {
  name: string
  agent: string
  description: string
  userMessage: string
}

/** Testes disponíveis (registrados estaticamente) */
const TEST_REGISTRY: TestDefinition[] = [
  // ── Search Agent (codebase only) ─────────────────────────────────
  {
    name: 'search-codebase-only',
    agent: 'search',
    description: 'Search Agent (codebase only) — Find TypeScript interfaces using semantic index',
    userMessage:
      'Find all TypeScript interfaces related to configuration and settings in this project. List the file paths, interface names, and what each one configures.',
  },
  {
    name: 'search-architecture',
    agent: 'search',
    description: 'Search Agent (codebase only) — Understand project architecture via index',
    userMessage:
      'Analyze the project architecture. What are the main modules, entry points, and how do they connect? Use the codebase index to understand the structure.',
  },
  // ── Search-Tools Agent (filesystem fallback) ─────────────────────
  {
    name: 'search-tools-grep',
    agent: 'search-tools',
    description: 'Search-Tools Agent (fallback) — Find patterns with grep/filesystem',
    userMessage:
      'Find all files that contain "TODO" or "FIXME" comments. List each file path, line number, and the comment content.',
  },
  {
    name: 'search-tools-explore',
    agent: 'search-tools',
    description: 'Search-Tools Agent (fallback) — Explore directory structure',
    userMessage:
      'Explore the project directory structure and list the main packages/modules. For each one, read the package.json and describe its purpose.',
  },
  // ── Other agents ─────────────────────────────────────────────────
  {
    name: 'code-reviewer',
    agent: 'code-reviewer',
    description: 'Code Reviewer Agent - Review orchestrator',
    userMessage:
      'Review the orchestrator.ts file for code quality, potential bugs, and suggest improvements.',
  },
  {
    name: 'explainer',
    agent: 'explainer',
    description: 'Explainer Agent - Explain subagent system',
    userMessage:
      'Explain how the subagent system works, including the task delegation and continuation protocol.',
  },
]

/** Estado do runner */
let core: AthionCore | null = null
let abortController: AbortController | null = null
let isRunning = false

/** Tracking de tokens acumulado */
let tokenState: TokenSnapshot = {
  contextLimit: 50_000,
  estimatedInput: 0,
  estimatedOutput: 0,
  totalUsed: 0,
  percentUsed: 0,
}

/** Callback para enviar mensagens via WebSocket */
type Emitter = (msg: WsServerMessage) => void

/** Retorna lista de testes disponíveis */
export function listTests(): TestInfo[] {
  return TEST_REGISTRY.map((t) => ({
    name: t.name,
    agent: t.agent,
    description: t.description,
  }))
}

/** Atualiza token snapshot e retorna cópia */
function updateTokens(input: number, output: number): TokenSnapshot {
  tokenState.estimatedInput += input
  tokenState.estimatedOutput += output
  tokenState.totalUsed = tokenState.estimatedInput + tokenState.estimatedOutput
  tokenState.percentUsed = Math.round((tokenState.totalUsed / tokenState.contextLimit) * 1000) / 10
  return { ...tokenState }
}

/** Reseta token tracking */
function resetTokens(): void {
  tokenState = {
    contextLimit: 50_000,
    estimatedInput: 0,
    estimatedOutput: 0,
    totalUsed: 0,
    percentUsed: 0,
  }
}

/** Estima tokens de texto (~4 chars por token) */
function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Mapeia SubAgentEvent para WsServerMessage */
function emitSubAgentEvent(event: SubAgentEvent, emit: Emitter): void {
  const ts = Date.now()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = event as any

  switch (e.type as string) {
    case 'start':
      emit({
        type: 'sub:start',
        agentName: e.agentName,
        taskId: e.task.id,
        description: e.task.description,
        tokens: updateTokens(estimateTextTokens(e.task.description), 0),
        ts,
      })
      break
    case 'content':
      emit({
        type: 'sub:content',
        content: truncatePreview(e.content, 500),
        tokens: updateTokens(0, estimateTextTokens(e.content)),
        ts,
      })
      break
    case 'tool_call':
      emit({
        type: 'sub:tool_call',
        toolName: e.toolName,
        args: e.args,
        tokens: updateTokens(0, estimateTextTokens(JSON.stringify(e.args))),
        ts,
      })
      break
    case 'tool_result': {
      const resultStr = JSON.stringify(e.result)
      const success =
        typeof e.result === 'object' && e.result !== null ? e.result.success !== false : true
      emit({
        type: 'sub:tool_result',
        toolName: e.toolName,
        success,
        preview: truncatePreview(resultStr),
        tokens: updateTokens(estimateTextTokens(resultStr), 0),
        ts,
      })
      break
    }
    case 'continuation_needed':
      emit({
        type: 'sub:continuation',
        continuationIndex: e.task.continuationIndex,
        accumulatedCount: e.task.accumulatedResults.length,
        tokens: updateTokens(0, 0),
        ts,
      })
      break
    case 'complete':
      emit({
        type: 'sub:complete',
        taskId: e.task.id,
        resultPreview: truncatePreview(e.task.result ?? 'No result'),
        tokens: updateTokens(0, 0),
        ts,
      })
      break
    case 'error':
      emit({
        type: 'sub:error',
        message: e.error.message,
        tokens: updateTokens(0, 0),
        ts,
      })
      break
  }
}

/** Bootstrap do core com instrumentação */
async function ensureCore(emit: Emitter): Promise<AthionCore> {
  if (core) return core

  emit({
    type: 'setup:step',
    step: '1/3',
    detail: 'Ensuring vllm-mlx is running...',
    ts: Date.now(),
  })

  const coreDir = resolve(import.meta.dir, '../../../core')

  core = await bootstrap({
    dbPath: '/tmp/athion-observability-athion.db',
    skillsDir: resolve(coreDir, 'skills'),
  })

  emit({ type: 'setup:step', step: '2/3', detail: 'Core bootstrapped', ts: Date.now() })

  // Instrumentar SubAgentManager — capturar spawn original ANTES de substituir
  const originalSpawn = core.subagents.spawn.bind(core.subagents)
  core.subagents.spawn = async function* (config, task, signal) {
    for await (const event of originalSpawn(config, task, signal)) {
      emitSubAgentEvent(event, emit)
      yield event
    }
  }

  emit({
    type: 'setup:tools',
    tools: core.tools.list().map((t) => t.name),
    ts: Date.now(),
  })

  emit({
    type: 'setup:agents',
    agents: core.subagents.list().map((a) => a.name),
    ts: Date.now(),
  })

  emit({ type: 'setup:step', step: '3/3', detail: 'Ready', ts: Date.now() })

  return core
}

/** Executa um teste e emite eventos via WebSocket */
export async function runTest(testName: string, emit: Emitter): Promise<void> {
  if (isRunning) {
    emit({
      type: 'orch:error',
      message: 'Teste já em execução. Aguarde a finalização ou pare o teste atual.',
      tokens: tokenState,
      ts: Date.now(),
    })
    return
  }

  const test = TEST_REGISTRY.find((t) => t.name === testName)
  if (!test) {
    emit({
      type: 'orch:error',
      message: `Test "${testName}" not found`,
      tokens: tokenState,
      ts: Date.now(),
    })
    return
  }

  isRunning = true
  resetTokens()
  abortController = new AbortController()
  const startTime = Date.now()

  try {
    const c = await ensureCore(emit)
    emit({ type: 'test:started', testName, ts: Date.now() })

    // Criar sessão
    const session = await c.orchestrator.createSession('observability-athion', testName)

    // Emitir mensagem do usuário
    emit({
      type: 'orch:user_message',
      content: test.userMessage,
      tokens: updateTokens(estimateTextTokens(test.userMessage), 0),
      ts: Date.now(),
    })

    // Stream do chat
    const stream = c.orchestrator.chat(session.id, { content: test.userMessage })
    let contentBuffer = ''

    for await (const event of stream) {
      if (abortController.signal.aborted) break
      processOrchestratorEvent(event, emit, contentBuffer)
      if (event.type === 'content') contentBuffer += event.content
    }

    const duration = Math.round(Date.now() - startTime)
    const passed = !abortController.signal.aborted
    emit({ type: 'test:finished', testName, passed, duration, ts: Date.now() })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emit({ type: 'orch:error', message, tokens: tokenState, ts: Date.now() })
    emit({
      type: 'test:finished',
      testName,
      passed: false,
      duration: Date.now() - startTime,
      ts: Date.now(),
    })
  } finally {
    isRunning = false
    abortController = null
  }
}

/** Para o teste em execução */
export function stopTest(): void {
  abortController?.abort()
}

/** Mapeia OrchestratorEvent para WsServerMessage */
function processOrchestratorEvent(
  event: OrchestratorEvent,
  emit: Emitter,
  _contentBuffer: string,
): void {
  const ts = Date.now()

  switch (event.type) {
    case 'content':
      emit({
        type: 'orch:content',
        content: event.content,
        tokens: updateTokens(0, estimateTextTokens(event.content)),
        ts,
      })
      break
    case 'tool_call':
      emit({
        type: 'orch:tool_call',
        id: event.id,
        name: event.name,
        args: event.args,
        tokens: updateTokens(0, estimateTextTokens(JSON.stringify(event.args))),
        ts,
      })
      break
    case 'tool_result':
      emit({
        type: 'orch:tool_result',
        id: event.id,
        name: event.name,
        success: event.result.success,
        preview: truncatePreview(
          JSON.stringify(event.result.success ? event.result.data : event.result.error),
        ),
        tokens: updateTokens(estimateTextTokens(JSON.stringify(event.result)), 0),
        ts,
      })
      break
    case 'subagent_start':
      emit({
        type: 'orch:subagent_start',
        agentName: event.agentName,
        tokens: updateTokens(0, 0),
        ts,
      })
      break
    case 'subagent_complete':
      emit({
        type: 'orch:subagent_complete',
        agentName: event.agentName,
        resultPreview: truncatePreview(JSON.stringify(event.result)),
        tokens: updateTokens(0, 0),
        ts,
      })
      break
    case 'finish':
      // Usar valores reais do provider quando disponíveis
      tokenState.estimatedInput = event.usage.promptTokens || tokenState.estimatedInput
      tokenState.estimatedOutput = event.usage.completionTokens || tokenState.estimatedOutput
      tokenState.totalUsed = tokenState.estimatedInput + tokenState.estimatedOutput
      tokenState.percentUsed =
        Math.round((tokenState.totalUsed / tokenState.contextLimit) * 1000) / 10
      emit({
        type: 'orch:finish',
        promptTokens: event.usage.promptTokens,
        completionTokens: event.usage.completionTokens,
        totalTokens: event.usage.totalTokens,
        tokens: { ...tokenState },
        ts,
      })
      break
    case 'error':
      emit({
        type: 'orch:error',
        message: event.error.message,
        tokens: updateTokens(0, 0),
        ts,
      })
      break
  }
}
