import type { ProviderLayer } from '../provider/provider'
import type { SkillManager } from '../skills/types'
import type { ToolRegistry } from '../tools/types'
import type { SubAgentConfig, SubAgentEvent, SubAgentTask } from './types'

/**
 * Dependencias para criar uma instancia de SubAgent.
 * @param provider - ProviderLayer
 * @param tools - ToolRegistry
 * @param skills - SkillManager
 * @param defaultProvider - Provider padrao
 * @param defaultModel - Modelo padrao
 */
export interface SubAgentDeps {
  provider: ProviderLayer
  tools: ToolRegistry
  skills: SkillManager
  defaultProvider: string
  defaultModel: string
}

/**
 * Executa um subagente com seu proprio ciclo de chat isolado.
 * O subagente recebe uma Task e vai atualizando conforme progride.
 * @param config - Configuracao do subagente
 * @param task - Task atribuida pelo orquestrador
 * @param deps - Dependencias injetadas
 * @param signal - Signal para cancelamento
 * @returns AsyncGenerator de SubAgentEvent
 */
export async function* runSubAgent(
  config: SubAgentConfig,
  task: SubAgentTask,
  deps: SubAgentDeps,
  signal?: AbortSignal,
): AsyncGenerator<SubAgentEvent> {
  const maxTurns = config.maxTurns ?? 50

  // Atualizar task para in_progress
  task.status = 'in_progress'
  task.updatedAt = new Date()
  yield { type: 'start', agentName: config.name, task }

  // 1. Montar system prompt a partir da skill
  const skill = deps.skills.get(config.skill)
  const systemPrompt = buildAgentPrompt(config, skill?.instructions, task)

  // 2. Filtrar tools pela whitelist
  const allowedTools = deps.tools.list().filter((t) => config.tools.includes(t.name))

  // 3. Preparar mensagens
  const messages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string }> = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: formatTaskPrompt(task) },
  ]

  // 4. Determinar provider/modelo
  const providerName = config.model?.provider ?? deps.defaultProvider
  const modelName = config.model?.model ?? deps.defaultModel

  // 5. Loop de chat do subagente
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

    const stream = deps.provider.streamChat({
      provider: providerName,
      model: modelName,
      messages,
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

    // Salvar resposta do assistente
    if (assistantContent) {
      messages.push({ role: 'assistant', content: assistantContent })
      task.result = assistantContent
      task.updatedAt = new Date()
      yield { type: 'task_update', task }
    }

    // Se nao tem tool calls, terminamos
    if (toolCalls.length === 0) {
      break
    }

    // Processar tool calls
    for (const tc of toolCalls) {
      const tool = allowedTools.find((t) => t.name === tc.name)
      if (!tool) {
        const errorMsg = `Tool "${tc.name}" not in whitelist for agent "${config.name}"`
        messages.push({ role: 'tool', content: `Error: ${errorMsg}` })
        yield { type: 'tool_result', toolName: tc.name, result: { error: errorMsg } }
        continue
      }

      const result = await deps.tools.execute(tc.name, tc.args)
      const resultContent = result.success ? JSON.stringify(result.data) : `Error: ${result.error}`

      messages.push({ role: 'tool', content: resultContent })
      yield { type: 'tool_result', toolName: tc.name, result }
    }
  }

  // Task concluida
  task.status = 'completed'
  task.updatedAt = new Date()
  yield { type: 'complete', task }
}

/**
 * Monta o system prompt do subagente incluindo contexto da task.
 * @param config - Configuracao do subagente
 * @param skillInstructions - Instructions da skill
 * @param task - Task atribuida pelo orquestrador
 * @returns System prompt do subagente
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
  sections.push(`# Your Task
Name: ${task.name}
Description: ${task.description}

You must complete this task. Update your progress as you work.
When you finish, provide a clear summary of what was done.`)

  return sections.join('\n\n')
}

/**
 * Formata a task como prompt inicial para o subagente.
 * @param task - Task atribuida pelo orquestrador
 * @returns Prompt inicial para o subagente
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
