import { z } from 'zod/v4'
import type { SubAgentManager, SubAgentTask, TaskStep } from '../subagent/types'
import { defineTool } from './registry'

/** taskToolParams
 * Descrição: Schema Zod de validação dos parâmetros da task tool
 */
const taskToolParams = z.object({
  agent: z.string().describe('Name of the sub-agent to delegate to'),
  description: z.string().describe('Detailed description of what the agent should do'),
  steps: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        try {
          return JSON.parse(val)
        } catch {
          return val
        }
      }
      return val
    }, z.array(z.string()).optional())
    .describe('Optional list of steps for the agent to follow'),
})

/** TaskToolParams
 * Descrição: Tipo inferido dos parâmetros da task tool a partir do schema Zod
 */
type TaskToolParams = z.infer<typeof taskToolParams>

/** TaskToolDeps
 * Descrição: Dependências para criar a task tool
 */
export interface TaskToolDeps {
  /** subagents
   * Descrição: Gerenciador de subagentes para delegação de tasks
   */
  subagents: SubAgentManager
}

/** MAX_CONTINUATIONS
 * Descrição: Limite de continuações automáticas por task para evitar loops infinitos
 */
const MAX_CONTINUATIONS = 5

/** createTaskTool
 * Descrição: Cria a task tool que permite ao LLM delegar trabalho para subagentes.
 * Suporta continuation protocol: se o agente sai com status 'partial',
 * re-spawna automaticamente com resultados acumulados até completar.
 * @param deps - Dependências com SubAgentManager
 * @returns ToolDefinition configurada para delegação de tasks
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

/** executeTask
 * Descrição: Executa uma task delegando para um subagente.
 * Implementa continuation loop: se o agente retorna 'partial',
 * re-spawna com contexto acumulado até completar ou atingir MAX_CONTINUATIONS.
 * @param subagents - Gerenciador de subagentes
 * @param params - Parâmetros da task (agente, descrição, steps)
 * @returns Resultado da execução com dados do agente ou mensagem de erro
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

/** KEYWORD_AGENT_MAP
 * Descrição: Mapa de palavras-chave que o LLM frequentemente usa para o agente correto.
 * Evita que erros como "codebase-analysis" vão para o agente errado.
 */
const KEYWORD_AGENT_MAP: Record<string, string> = {
  codebase: 'search',
  analysis: 'search',
  analyze: 'search',
  analyzer: 'search',
  project: 'search',
  inspector: 'search',
  reader: 'search',
  investigate: 'search',
  explore: 'search',
  fix: 'debugger',
  diagnose: 'debugger',
  bug: 'debugger',
  generate: 'coder',
  create: 'coder',
  implement: 'coder',
  test: 'test-writer',
  spec: 'test-writer',
  review: 'code-review',
  audit: 'code-review',
  refactor: 'refactorer',
  restructure: 'refactorer',
  explain: 'explainer',
  document: 'explainer',
}

/** fuzzyMatchAgent
 * Descrição: Encontra o agente mais próximo quando o LLM envia uma variação do nome.
 * Prioridade:
 *   1. Contenção por prefixo/sufixo (ex: "code-reviewer" -> "code-review")
 *   2. Contenção por substring (ex: "review" -> "code-review")
 *   3. Mapa de palavras-chave (ex: "codebase-analysis" -> "search")
 *   4. Sobreposição por palavras (>=60% de similaridade de comprimento)
 * @param subagents - Gerenciador de subagentes para busca
 * @param name - Nome enviado pelo LLM
 * @returns SubAgentConfig do agente mais próximo ou undefined
 */
function fuzzyMatchAgent(subagents: SubAgentManager, name: string) {
  const normalized = name.toLowerCase().replace(/[_\s]/g, '-')
  const requestedWords = normalized.split('-').filter(Boolean)
  const agents = subagents.list()

  // 1. One name starts with / ends with the other
  for (const a of agents) {
    if (a.name.startsWith(normalized) || normalized.startsWith(a.name)) {
      return subagents.getAgent(a.name)
    }
  }

  // 2. Substring containment
  for (const a of agents) {
    if (a.name.includes(normalized) || normalized.includes(a.name)) {
      return subagents.getAgent(a.name)
    }
  }

  // 3. Keyword map — highest-priority keyword wins
  for (const word of requestedWords) {
    const mapped = KEYWORD_AGENT_MAP[word]
    if (mapped) return subagents.getAgent(mapped)
  }

  // 4. Word-level overlap with 60% length similarity guard
  // (prevents "codebase" from matching "code" in "code-review")
  let bestScore = 0
  let bestAgent: (typeof agents)[0] | undefined
  for (const a of agents) {
    const agentWords = a.name.split('-').filter(Boolean)
    const score = requestedWords.filter((w) =>
      agentWords.some((aw) => {
        if (aw === w) return true
        const [shorter, longer] = aw.length <= w.length ? [aw, w] : [w, aw]
        return longer.startsWith(shorter) && shorter.length / longer.length >= 0.6
      }),
    ).length
    if (score > bestScore) {
      bestScore = score
      bestAgent = a
    }
  }
  if (bestAgent && bestScore > 0) return subagents.getAgent(bestAgent.name)

  return undefined
}

/** createTask
 * Descrição: Cria uma nova SubAgentTask a partir dos parâmetros da task tool
 * @param params - Parâmetros com agente, descrição e steps opcionais
 * @returns SubAgentTask inicializada com status 'pending'
 */
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

/** buildSteps
 * Descrição: Converte array de strings em array de TaskStep com status 'não completado'
 * @param steps - Lista de descrições de steps (opcional)
 * @returns Array de TaskStep ou array vazio se não houver steps
 */
function buildSteps(steps?: string[]): TaskStep[] {
  if (!steps || steps.length === 0) return []
  return steps.map((description) => ({ description, completed: false }))
}
