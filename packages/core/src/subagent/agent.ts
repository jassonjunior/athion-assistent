import type { ProviderLayer } from '../provider/provider'
import type { SkillManager } from '../skills/types'
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
}

/** Limite de contexto do subagente em tokens estimados. */
const CONTEXT_LIMIT = 50_000
/** Threshold para tentar sliding-window (80% do contexto). */
const SLIDING_WINDOW_THRESHOLD = 0.8
/** Threshold para forçar continuação — se após sliding-window ainda acima disso, sai. */
const CONTINUATION_THRESHOLD = 0.7
/** Máximo de chars para resultados acumulados no prompt de continuação. */
const MAX_ACCUMULATED_CHARS = 15_000

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

  // 1. Montar system prompt (inclui contexto de continuação se aplicável)
  const skill = deps.skills.get(config.skill)
  const systemPrompt = buildAgentPrompt(config, skill?.instructions, task)

  // 2. Filtrar tools pela whitelist
  const allowedTools = deps.tools.list().filter((t) => config.tools.includes(t.name))
  const providerTools: Record<string, { description: string; parameters: unknown }> = {}
  for (const t of allowedTools) {
    providerTools[t.name] = { description: t.description, parameters: t.parameters }
  }

  // 3. Preparar mensagens
  const messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: string | unknown[]
  }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: formatTaskPrompt(task) },
  ]

  // 4. Provider/modelo
  const providerName = config.model?.provider ?? deps.defaultProvider
  const modelName = config.model?.model ?? deps.defaultModel

  // 5. Loop de chat
  const resultParts: string[] = []

  for (let turn = 0; turn < maxTurns; turn++) {
    if (signal?.aborted) {
      task.status = 'failed'
      task.result = 'Aborted by user'
      task.updatedAt = new Date()
      yield { type: 'error', error: new Error('SubAgent aborted'), task }
      return
    }

    let assistantContent = ''
    const toolCalls: Array<{ id: string; name: string; args: unknown }> = []

    // Gerenciamento de contexto com detecção de continuação
    const estimatedTokens = estimateTokens(messages)
    if (estimatedTokens > CONTEXT_LIMIT * SLIDING_WINDOW_THRESHOLD) {
      // Tentar sliding-window primeiro
      const systemMsgs = messages.filter((m) => m.role === 'system')
      const nonSystem = messages.filter((m) => m.role !== 'system')
      const keep = nonSystem.slice(-Math.max(10, Math.floor(nonSystem.length * 0.5)))
      messages.length = 0
      messages.push(...systemMsgs, ...keep)

      // Re-estimar após sliding-window
      const afterTruncation = estimateTokens(messages)

      // Se AINDA acima do threshold de continuação, sair para continuation
      if (afterTruncation > CONTEXT_LIMIT * CONTINUATION_THRESHOLD && resultParts.length > 0) {
        task.status = 'partial'
        task.result = resultParts.join('\n')
        task.accumulatedResults.push(...resultParts)
        task.remainingWork = buildRemainingWorkSummary(task, resultParts)
        task.updatedAt = new Date()
        yield { type: 'continuation_needed', task }
        return
      }
    }

    const stream = deps.provider.streamChat({
      provider: providerName,
      model: modelName,
      messages,
      ...(Object.keys(providerTools).length > 0 ? { tools: providerTools } : {}),
    })

    for await (const event of stream) {
      if (signal?.aborted) {
        task.status = 'failed'
        task.result = 'Aborted by user'
        task.updatedAt = new Date()
        yield { type: 'error', error: new Error('SubAgent aborted'), task }
        return
      }

      if (event.type === 'content') {
        assistantContent += event.content
        yield { type: 'content', content: event.content }
      }

      if (event.type === 'tool_call') {
        toolCalls.push({ id: event.id, name: event.name, args: event.args })
        yield { type: 'tool_call', toolName: event.name, args: event.args }
      }

      if (event.type === 'error') {
        task.status = 'failed'
        task.result = event.error.message
        task.updatedAt = new Date()
        yield { type: 'error', error: event.error, task }
        return
      }
    }

    // Acumular resposta do assistente
    if (assistantContent) {
      resultParts.push(assistantContent)
      task.result = resultParts.join('\n')
      task.updatedAt = new Date()
      yield { type: 'task_update', task }
    }

    // Se não tem tool calls, terminamos
    if (toolCalls.length === 0) {
      if (assistantContent) {
        messages.push({ role: 'assistant', content: assistantContent })
      }
      break
    }

    // Push assistant com tool call parts (formato AI SDK v6)
    const assistantParts: unknown[] = []
    if (assistantContent) {
      assistantParts.push({ type: 'text', text: assistantContent })
    }
    for (const tc of toolCalls) {
      assistantParts.push({
        type: 'tool-call',
        toolCallId: tc.id,
        toolName: tc.name,
        input: tc.args,
      })
    }
    messages.push({ role: 'assistant', content: assistantParts })

    // Processar tool calls
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
      const resultText = truncateResult(rawText, 10_000)
      messages.push({
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: tc.id,
            toolName: tc.name,
            output: { type: 'text', value: resultText },
          },
        ],
      })
      if (result.success) {
        resultParts.push(`[${tc.name}] ${truncateResult(rawText, 3_000)}`)
      }
      yield { type: 'tool_result', toolName: tc.name, result }
    }
  }

  // Resultado final
  task.result = resultParts.join('\n')
  task.status = 'completed'
  task.updatedAt = new Date()
  yield { type: 'complete', task }
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

/** Estima tokens de um array de mensagens (~4 chars por token). */
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

/** Trunca resultado de tool se exceder o limite de caracteres. */
function truncateResult(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + `\n...[truncated: ${text.length - maxChars} chars removed]`
}

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
