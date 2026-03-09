import { z } from 'zod/v4'
import type { SubAgentManager, SubAgentTask, TaskStep } from '../subagent/types'
import { defineTool } from './registry'

const taskToolParams = z.object({
  agent: z.string().describe('Name of the sub-agent to delegate to'),
  description: z.string().describe('Detailed description of what the agent should do'),
  steps: z.array(z.string()).optional().describe('Optional list of steps for the agent to follow'),
})
type TaskToolParams = z.infer<typeof taskToolParams>
export interface TaskToolDeps {
  subagents: SubAgentManager
}

/** Limite de continuações automáticas por task. */
const MAX_CONTINUATIONS = 5

/**
 * Cria a task tool que permite ao LLM delegar trabalho para subagentes.
 * Suporta continuation protocol: se o agente sai com status 'partial',
 * re-spawna automaticamente com resultados acumulados até completar.
 */
export function createTaskTool(deps: TaskToolDeps) {
  const { subagents } = deps

  return defineTool({
    name: 'task',
    description:
      'Delegate a task to a specialized sub-agent. Use when the task requires focused expertise or multiple steps.',
    parameters: taskToolParams,
    execute: (params: TaskToolParams) => executeTask(subagents, params),
  })
}

/**
 * Executa uma task delegando para um subagente.
 * Implementa continuation loop: se o agente retorna 'partial',
 * re-spawna com contexto acumulado até completar ou atingir MAX_CONTINUATIONS.
 */
async function executeTask(subagents: SubAgentManager, params: TaskToolParams) {
  let config = subagents.getAgent(params.agent)

  // Fuzzy match: se não encontrou exato, tenta por similaridade
  if (!config) {
    config = fuzzyMatchAgent(subagents, params.agent)
  }

  if (!config) {
    const available = subagents
      .list()
      .map((a) => a.name)
      .join(', ')
    return {
      success: false as const,
      error: `Sub-agent "${params.agent}" not found. Available: ${available}`,
    }
  }

  const task = createTask(params)

  try {
    for (let continuation = 0; continuation <= MAX_CONTINUATIONS; continuation++) {
      task.continuationIndex = continuation

      const generator = subagents.spawn(config, task)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _event of generator) {
        /* drain — eventos tratados pelo orchestrator */
      }

      if (task.status === 'completed') {
        // Consolidar resultado final: accumulated + resultado atual
        const allResults = [...task.accumulatedResults]
        if (task.result) allResults.push(task.result)
        const finalResult = allResults.filter(Boolean).join('\n')

        return {
          success: true as const,
          data: {
            agent: config.name,
            task: task.name,
            result: finalResult || 'Task completed',
            steps: task.steps,
            continuations: continuation,
          },
        }
      }

      if (task.status === 'failed') {
        return {
          success: false as const,
          error: task.result ?? `Sub-agent "${config.name}" failed`,
        }
      }

      if (task.status === 'partial') {
        // Preparar para próxima continuação — agent.ts já preencheu accumulatedResults e remainingWork
        task.status = 'pending'
        task.result = ''
        continue
      }

      // Status inesperado
      break
    }

    // Esgotou continuações — retornar resultado parcial
    const partialResult = task.accumulatedResults.join('\n')
    return {
      success: true as const,
      data: {
        agent: config.name,
        task: task.name,
        result:
          partialResult +
          '\n\n[Note: Task required too many continuations. Partial results above.]',
        steps: task.steps,
        continuations: MAX_CONTINUATIONS,
      },
    }
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Fuzzy match: finds the closest agent name when LLM sends a slight variation.
 * Matches by prefix, suffix, or substring containment.
 * e.g. "code-review" → "code-reviewer", "reviewer" → "code-reviewer"
 */
function fuzzyMatchAgent(subagents: SubAgentManager, name: string) {
  const normalized = name.toLowerCase().replace(/[_\s]/g, '-')
  const agents = subagents.list()

  // 1. One name starts with / ends with the other
  for (const a of agents) {
    if (a.name.startsWith(normalized) || normalized.startsWith(a.name)) {
      return subagents.getAgent(a.name)
    }
  }

  // 2. Substring match (e.g. "review" matches "code-reviewer")
  for (const a of agents) {
    if (a.name.includes(normalized) || normalized.includes(a.name)) {
      return subagents.getAgent(a.name)
    }
  }

  return undefined
}

function createTask(params: TaskToolParams): SubAgentTask {
  return {
    id: crypto.randomUUID(),
    name: params.agent,
    description: params.description,
    status: 'pending',
    steps: buildSteps(params.steps),
    accumulatedResults: [],
    continuationIndex: 0,
    maxContinuations: MAX_CONTINUATIONS,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function buildSteps(steps?: string[]): TaskStep[] {
  if (!steps || steps.length === 0) return []
  return steps.map((description) => ({ description, completed: false }))
}
