import type { ProviderLayer } from '../provider/provider'
import type { SkillManager } from '../skills/types'
import type { SummarizationService } from '../tokens/summarize'
import type { ToolRegistry } from '../tools/types'
import type { SubAgentConfig, SubAgentEvent, SubAgentTask } from './types'

/**
 * Dependencias para criar uma instancia de SubAgent.
 */
export interface SubAgentDeps {
  provider: ProviderLayer
  tools: ToolRegistry
  skills: SkillManager
  defaultProvider: string
  defaultModel: string
  /** Serviço de summarização para compactar contexto via LLM (opcional, fallback: sliding-window) */
  summarizer?: SummarizationService | undefined
}

/** Limite de contexto do subagente em tokens estimados. */
const CONTEXT_LIMIT = 50_000
/** Threshold para tentar sliding-window (80% do contexto). */
const SLIDING_WINDOW_THRESHOLD = 0.8
/** Threshold para forçar continuação — se após sliding-window ainda acima disso, sai. */
const CONTINUATION_THRESHOLD = 0.7
/** Máximo de chars para resultados acumulados no prompt de continuação. */
const MAX_ACCUMULATED_CHARS = 15_000

type AgentMessage = { role: 'user' | 'assistant' | 'system' | 'tool'; content: string | unknown[] }
type ToolCall = { id: string; name: string; args: unknown }
type ProviderTools = Record<string, { description: string; parameters: unknown }>

/**
 * Executa um subagente com seu proprio ciclo de chat isolado.
 * Suporta continuation protocol: se o contexto se esgota, sai com status 'partial'
 * e o task-tool re-spawna com os resultados acumulados.
 */
export async function* runSubAgent(
  config: SubAgentConfig,
  task: SubAgentTask,
  deps: SubAgentDeps,
  signal?: AbortSignal,
): AsyncGenerator<SubAgentEvent> {
  const maxTurns = config.maxTurns ?? 50

  task.status = 'in_progress'
  task.updatedAt = new Date()
  yield { type: 'start', agentName: config.name, task }

  const skill = deps.skills.get(config.skill)
  const systemPrompt = buildAgentPrompt(config, skill?.instructions, task)
  const allowedTools = deps.tools.list().filter((t) => config.tools.includes(t.name))
  const providerTools = buildProviderTools(allowedTools)
  const messages: AgentMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: formatTaskPrompt(task) },
  ]
  const providerName = config.model?.provider ?? deps.defaultProvider
  const modelName = config.model?.model ?? deps.defaultModel
  const resultParts: string[] = []
  let agentDone = false
  // Conta turns consecutivos sem tool calls — permite 1 nudge antes de concluir
  let noToolCallStreak = 0

  for (let turn = 0; turn < maxTurns; turn++) {
    if (signal?.aborted) {
      task.status = 'failed'
      task.result = 'Aborted by user'
      task.updatedAt = new Date()
      yield { type: 'error', error: new Error('SubAgent aborted'), task }
      return
    }

    const compacted = await compactContextIfNeeded(messages, resultParts, task, deps)
    if (compacted === 'continuation') {
      yield { type: 'continuation_needed', task }
      return
    }

    const { assistantContent, toolCalls, errorEvent } = yield* streamTurn(
      deps.provider,
      providerName,
      modelName,
      messages,
      providerTools,
      signal,
    )
    if (errorEvent) {
      task.status = 'failed'
      task.result = errorEvent.error.message
      task.updatedAt = new Date()
      yield errorEvent
      return
    }

    if (assistantContent) {
      resultParts.push(assistantContent)
      task.result = resultParts.join('\n')
      task.updatedAt = new Date()
      yield { type: 'task_update', task }
    }

    if (toolCalls.length === 0) {
      messages.push({ role: 'assistant', content: assistantContent })
      noToolCallStreak++

      // Permite 1 nudge quando o modelo descreve intenção sem chamar ferramentas.
      // Na segunda vez consecutiva sem tool calls, aceita o resultado como final.
      if (noToolCallStreak === 1 && Object.keys(providerTools).length > 0 && turn < maxTurns - 1) {
        const intent = assistantContent.trim().slice(0, 300)
        const toolNames = Object.keys(providerTools).join(', ')
        messages.push({
          role: 'user',
          content: `You said: "${intent}"\n\nYou did not call any tool. If you want to proceed with a specific action, call the exact tool now (available: ${toolNames}). If your analysis is already complete, provide your final summary directly.`,
        })
        continue
      }

      agentDone = true
      break
    }

    noToolCallStreak = 0
    pushAssistantWithToolCalls(messages, assistantContent, toolCalls)
    yield* processToolCalls(toolCalls, allowedTools, messages, resultParts, deps, config)
  }

  if (!agentDone && resultParts.length > 0) {
    task.status = 'partial'
    task.result = resultParts.join('\n')
    task.accumulatedResults.push(...resultParts)
    task.remainingWork = buildRemainingWorkSummary(task, resultParts)
    task.updatedAt = new Date()
    yield { type: 'continuation_needed', task }
    return
  }

  task.result = resultParts.join('\n')
  task.status = 'completed'
  task.updatedAt = new Date()
  yield { type: 'complete', task }
}

function buildProviderTools(allowedTools: ReturnType<ToolRegistry['list']>): ProviderTools {
  const providerTools: ProviderTools = {}
  for (const t of allowedTools) {
    providerTools[t.name] = { description: t.description, parameters: t.parameters }
  }
  return providerTools
}

async function compactContextIfNeeded(
  messages: AgentMessage[],
  resultParts: string[],
  task: SubAgentTask,
  deps: SubAgentDeps,
): Promise<'ok' | 'continuation'> {
  const estimatedTokens = estimateTokens(messages)
  if (estimatedTokens <= CONTEXT_LIMIT * SLIDING_WINDOW_THRESHOLD) return 'ok'

  if (deps.summarizer) {
    try {
      const flat = messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      }))
      const summarized = await deps.summarizer.summarize(flat)
      messages.length = 0
      messages.push(
        ...summarized.map((m) => ({
          role: m.role as AgentMessage['role'],
          content: m.content as string | unknown[],
        })),
      )
    } catch {
      applySlidingWindow(messages)
    }
  } else {
    applySlidingWindow(messages)
  }

  const afterCompaction = estimateTokens(messages)
  if (afterCompaction > CONTEXT_LIMIT * CONTINUATION_THRESHOLD && resultParts.length > 0) {
    task.status = 'partial'
    task.result = resultParts.join('\n')
    task.accumulatedResults.push(...resultParts)
    task.remainingWork = buildRemainingWorkSummary(task, resultParts)
    task.updatedAt = new Date()
    return 'continuation'
  }
  return 'ok'
}

async function* streamTurn(
  provider: ProviderLayer,
  providerName: string,
  modelName: string,
  messages: AgentMessage[],
  providerTools: ProviderTools,
  signal: AbortSignal | undefined,
): AsyncGenerator<
  SubAgentEvent,
  {
    assistantContent: string
    toolCalls: ToolCall[]
    errorEvent: Extract<SubAgentEvent, { type: 'error' }> | null
  }
> {
  let assistantContent = ''
  const toolCalls: ToolCall[] = []

  const stream = provider.streamChat({
    provider: providerName,
    model: modelName,
    messages,
    ...(Object.keys(providerTools).length > 0 ? { tools: providerTools } : {}),
  })

  for await (const event of stream) {
    if (signal?.aborted) {
      return {
        assistantContent,
        toolCalls,
        errorEvent: {
          type: 'error',
          error: new Error('SubAgent aborted'),
          task: undefined as never,
        },
      }
    }
    if (event.type === 'content') {
      assistantContent += event.content
      yield { type: 'content', content: event.content }
    } else if (event.type === 'tool_call') {
      toolCalls.push({ id: event.id, name: event.name, args: event.args })
      yield { type: 'tool_call', toolName: event.name, args: event.args }
    } else if (event.type === 'error') {
      return {
        assistantContent,
        toolCalls,
        errorEvent: { type: 'error', error: event.error, task: undefined as never },
      }
    }
  }

  return { assistantContent, toolCalls, errorEvent: null }
}

function pushAssistantWithToolCalls(
  messages: AgentMessage[],
  assistantContent: string,
  toolCalls: ToolCall[],
): void {
  const parts: unknown[] = []
  if (assistantContent) parts.push({ type: 'text', text: assistantContent })
  for (const tc of toolCalls) {
    parts.push({ type: 'tool-call', toolCallId: tc.id, toolName: tc.name, input: tc.args })
  }
  messages.push({ role: 'assistant', content: parts })
}

async function* processToolCalls(
  toolCalls: ToolCall[],
  allowedTools: ReturnType<ToolRegistry['list']>,
  messages: AgentMessage[],
  resultParts: string[],
  deps: SubAgentDeps,
  config: SubAgentConfig,
): AsyncGenerator<SubAgentEvent> {
  for (const tc of toolCalls) {
    const tool = allowedTools.find((t) => t.name === tc.name)
    if (!tool) {
      const errorMsg = `Tool "${tc.name}" not in whitelist for agent "${config.name}"`
      messages.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: tc.id,
            toolName: tc.name,
            output: { type: 'text', value: `Error: ${errorMsg}` },
          },
        ],
      })
      yield { type: 'tool_result', toolName: tc.name, result: { error: errorMsg } }
      continue
    }
    const result = await deps.tools.execute(tc.name, tc.args)
    const rawText = result.success ? JSON.stringify(result.data) : `Error: ${result.error}`
    messages.push({
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: tc.id,
          toolName: tc.name,
          output: { type: 'text', value: truncateResult(rawText, 10_000) },
        },
      ],
    })
    if (result.success) resultParts.push(`[${tc.name}] ${truncateResult(rawText, 3_000)}`)
    yield { type: 'tool_result', toolName: tc.name, result }
  }
}

/**
 * Monta o system prompt do subagente.
 * Se é uma continuação (continuationIndex > 0), inclui resultados anteriores e remaining work.
 */
function buildAgentPrompt(
  config: SubAgentConfig,
  skillInstructions: string | undefined,
  task: SubAgentTask,
): string {
  const sections: string[] = []

  if (skillInstructions) {
    sections.push(skillInstructions)
  }

  sections.push(`You are the "${config.name}" agent. ${config.description}`)

  if (config.tools.includes('search_codebase')) {
    sections.push(`# Search Protocol (MANDATORY)
You have access to two search tools. Always use them in this order:
1. **search_codebase** — semantic search over the indexed codebase. Use this FIRST for any code-related question.
2. **search_files** — grep-based text search. Use this ONLY if search_codebase returns 0 results, or if you need to find an exact string/regex match that semantic search missed.

Never skip search_codebase. Never use search_files as the first tool when searching for code.`)
  }

  if (task.continuationIndex > 0 && task.accumulatedResults.length > 0) {
    const compressed = compressAccumulatedResults(task.accumulatedResults, MAX_ACCUMULATED_CHARS)
    sections.push(`# CONTINUATION (run ${task.continuationIndex + 1})
You are continuing a previous task. Here is what was accomplished so far:

## Previous Results
${compressed}

## Remaining Work
${task.remainingWork ?? task.description}

Continue from where the previous run left off. Do NOT repeat work already done.
Focus on the remaining items. When done, provide a COMPLETE final summary that includes both previous and new results.`)
  } else {
    sections.push(`# Your Task
Name: ${task.name}
Description: ${task.description}

You must complete this task. Update your progress as you work.
When you finish, provide a clear summary of what was done.

When working on tasks that involve many files or large amounts of data:
- After each tool call, summarize the key findings briefly before moving on
- Keep your intermediate summaries concise (2-3 sentences per finding)`)
  }

  return sections.join('\n\n')
}

/**
 * Sintetiza o que resta fazer baseado nos steps da task e resultados coletados.
 */
function buildRemainingWorkSummary(task: SubAgentTask, resultParts: string[]): string {
  const pendingSteps = task.steps.filter((s) => !s.completed)

  if (pendingSteps.length > 0) {
    const stepsList = pendingSteps.map((s, i) => `${i + 1}. ${s.description}`).join('\n')
    return `Remaining steps:\n${stepsList}`
  }

  return `Continue the original task: ${task.description}\nAlready collected ${resultParts.length} result parts. Continue gathering remaining data.`
}

/**
 * Comprime resultados acumulados para caber no limite de chars.
 * Mantém proporcionalmente, priorizando primeiros e últimos.
 */
function compressAccumulatedResults(results: string[], maxChars: number): string {
  const joined = results.join('\n---\n')
  if (joined.length <= maxChars) return joined

  // Truncar cada resultado proporcionalmente
  const perResult = Math.floor(maxChars / results.length)
  const compressed = results.map((r) =>
    r.length > perResult ? r.slice(0, perResult) + '...[compressed]' : r,
  )
  return compressed.join('\n---\n')
}

/** Apply sliding-window mechanism: discard old messages, keep 50% more recent.
 * @param messages - The messages to apply sliding-window to.
 * @returns void
 * @example
 * const messages = [
 *   { role: 'system', content: 'You are a helpful assistant.' },
 *   { role: 'user', content: 'Hello, how are you?' },
 *   { role: 'assistant', content: 'I am fine, thank you!' },
 * ]
 * applySlidingWindow(messages)
 * console.log(messages) // [ { role: 'system', content: 'You are a helpful assistant.' }, { role: 'assistant', content: 'I am fine, thank you!' } ]
 */
function applySlidingWindow(messages: Array<{ role: string; content: string | unknown[] }>): void {
  const systemMsgs = messages.filter((m) => m.role === 'system')
  const nonSystem = messages.filter((m) => m.role !== 'system')
  const keep = nonSystem.slice(-Math.max(10, Math.floor(nonSystem.length * 0.5)))
  messages.length = 0
  messages.push(...systemMsgs, ...keep)
}

/** Estimate tokens of a list of messages (~4 chars per token).
 * @param messages - The messages to estimate tokens for.
 * @returns The estimated number of tokens.
 * @example
 * const messages = [
 *   { role: 'system', content: 'You are a helpful assistant.' },
 *   { role: 'user', content: 'Hello, how are you?' },
 *   { role: 'assistant', content: 'I am fine, thank you!' },
 *
 * const tokens = estimateTokens(messages)
 * console.log(tokens) // 3
 */
function estimateTokens(messages: Array<{ role: string; content: string | unknown[] }>): number {
  let chars = 0
  for (const m of messages) {
    if (typeof m.content === 'string') {
      chars += m.content.length
    } else {
      chars += JSON.stringify(m.content).length
    }
  }
  return Math.ceil(chars / 4)
}

/** Trunca resultado de tool se exceder o limite de caracteres.
 * @param text - The text to truncate.
 * @param maxChars - The maximum number of characters to allow.
 * @returns The truncated text.
 * @example
 * const text = 'This is a long text that needs to be truncated.'
 * const truncated = truncateResult(text, 10)
 * console.log(truncated) // 'This is a long...'
 */
function truncateResult(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + `\n...[truncated: ${text.length - maxChars} chars removed]`
}

/** Format the task prompt.
 * @param task - The task to format.
 * @returns The formatted task prompt.
 * @example
 * const task = {
 *   name: 'Task 1',
 *   description: 'This is a task description.'
 * }
 * const prompt = formatTaskPrompt(task)
 * console.log(prompt) // 'Execute the following task:\n\n**Task 1**\nThis is a task description.'
 */
function formatTaskPrompt(task: SubAgentTask): string {
  let prompt = `Execute the following task:\n\n**${task.name}**\n${task.description}`

  if (task.steps.length > 0) {
    const stepsList = task.steps
      .map((s, i) => `${i + 1}. [${s.completed ? 'x' : ' '}] ${s.description}`)
      .join('\n')
    prompt += `\n\nSteps:\n${stepsList}`
  }

  return prompt
}
