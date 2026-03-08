import { z } from 'zod/v4'
import type { SubAgentManager, SubAgentTask, TaskStep } from '../subagent/types'
import { defineTool } from './registry'

/**
 * Schema Zod para os argumentos da task tool.
 * Define o que o LLM pode passar ao delegar trabalho para um subagente.
 * @example
 * {
 *   agent: 'code-reviewer',
 *   description: 'Review the code and provide a report',
 *   steps: ['Review the code', 'Provide a report'],
 * }
 */
const taskToolParams = z.object({
  agent: z.string().describe('Name of the sub-agent to delegate to'),
  description: z.string().describe('Detailed description of what the agent should do'),
  steps: z.array(z.string()).optional().describe('Optional list of steps for the agent to follow'),
})
type TaskToolParams = z.infer<typeof taskToolParams>
export interface TaskToolDeps {
  subagents: SubAgentManager
}

/**
 * Cria a task tool que permite ao LLM delegar trabalho para subagentes.
 * Registra-se no ToolRegistry como qualquer outra tool.
 *
 * Os eventos do subagente sao consumidos internamente pelo generator.
 * O orchestrator repassa eventos relevantes via OrchestratorEvent.
 *
 * @param deps - Dependencias (SubAgentManager)
 * @returns ToolDefinition da task tool
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
 * @param subagents - SubAgentManager para buscar e executar subagentes
 * @param params - Parametros validados pelo schema Zod
 * @returns ToolResult com resultado da task
 */
async function executeTask(subagents: SubAgentManager, params: TaskToolParams) {
  const config = subagents.getAgent(params.agent)
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
    // Consome o generator inteiro — eventos intermediarios
    // sao tratados pelo orchestrator que wrappeia esta tool
    const generator = subagents.spawn(config, task)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _event of generator) {
      /* drain */
    }

    if (task.status === 'completed') {
      return {
        success: true as const,
        data: {
          agent: config.name,
          task: task.name,
          result: task.result ?? 'Task completed',
          steps: task.steps,
        },
      }
    }
    return { success: false as const, error: task.result ?? `Sub-agent "${config.name}" failed` }
  } catch (err) {
    return { success: false as const, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Cria uma SubAgentTask a partir dos parametros da tool.
 */
function createTask(params: TaskToolParams): SubAgentTask {
  return {
    id: crypto.randomUUID(),
    name: params.agent,
    description: params.description,
    status: 'pending',
    steps: buildSteps(params.steps),
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * Converte array de strings em TaskSteps.
 * @param steps - Array de descricoes de steps (opcional)
 * @returns Array de TaskStep
 */
function buildSteps(steps?: string[]): TaskStep[] {
  if (!steps || steps.length === 0) return []
  return steps.map((description) => ({ description, completed: false }))
}
