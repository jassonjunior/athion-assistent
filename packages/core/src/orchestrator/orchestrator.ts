import type { Bus } from '../bus/bus'
import type { ConfigManager } from '../config/config'
import type { ProviderLayer } from '../provider/provider'
import type { StreamEvent as ProviderStreamEvent } from '../provider/types'
import type { SkillManager } from '../skills/types'
import type { TokenManager } from '../tokens/types'
import type { ToolDefinition, ToolRegistry } from '../tools/types'
import type { PromptBuilder } from './prompt-builder'
import type { SessionManager } from './session'
import type { DispatchContext, ToolDispatcher } from './tool-dispatcher'
import type {
  AgentDefinition,
  Orchestrator,
  OrchestratorEvent,
  Session,
  UserMessage,
} from './types'

/**
 * Dependencias injetadas no Orchestrator.
 * @param config - ConfigManager
 * @param bus - EventBus
 * @param provider - ProviderLayer
 * @param tools - ToolRegistry
 * @param tokens - TokenManager
 * @param skills - SkillManager
 * @param session - SessionManager
 * @param promptBuilder - PromptBuilder
 * @param toolDispatcher - ToolDispatcher
 */
export interface OrchestratorDeps {
  config: ConfigManager
  bus: Bus
  provider: ProviderLayer
  tools: ToolRegistry
  tokens: TokenManager
  skills: SkillManager
  session: SessionManager
  promptBuilder: PromptBuilder
  toolDispatcher: ToolDispatcher
}

/**
 * Cria uma instancia do Orchestrator.
 * Coordena o loop de chat com streaming, tool calls e subagentes.
 * REGRA: Este arquivo NUNCA deve ultrapassar 300 linhas.
 * @param deps - Dependencias injetadas (todos os servicos da Fase 1 + helpers)
 * @returns Instancia do Orchestrator
 */
export function createOrchestrator(deps: OrchestratorDeps): Orchestrator {
  const { config, provider, tools, tokens, session, promptBuilder, toolDispatcher } = deps

  const agents: AgentDefinition[] = []

  /**
   * Inicia chat streaming com uma sessao existente
   * @param sessionId - ID da sessao atual
   * @param message - Mensagem do usuario
   * @returns AsyncGenerator de OrchestratorEvent
   */
  async function* chat(sessionId: string, message: UserMessage): AsyncGenerator<OrchestratorEvent> {
    // 1. Carregar sessao e mensagens
    const currentSession = session.load(sessionId)
    const messages = session.getMessages(sessionId)

    // 2. Adicionar mensagem do usuario
    session.addMessage(sessionId, 'user', message.content)
    messages.push({ role: 'user', content: message.content })

    // 3. Montar system prompt
    const systemPrompt = promptBuilder.build(currentSession, tools.list(), agents)

    // 4. Verificar compaction
    if (tokens.needsCompaction()) {
      session.compress(sessionId)
      const compacted = session.getMessages(sessionId)
      messages.length = 0
      messages.push(...compacted)
    }

    // 5. Preparar mensagens para o LLM
    const llmMessages: Array<{ role: 'user' | 'assistant' | 'system' | 'tool'; content: string }> =
      [{ role: 'system', content: systemPrompt }, ...messages.map(toProviderMessage)]

    // 6. Loop de streaming (pode ter múltiplos turnos se houver tool calls)
    const actions: string[] = []
    let continueLoop = true

    while (continueLoop) {
      continueLoop = false
      let assistantContent = ''
      const pendingToolCalls: Array<{ id: string; name: string; args: unknown }> = []

      // Chamar o LLM
      const stream = provider.streamChat({
        provider: config.get('provider') as string,
        model: config.get('model') as string,
        messages: llmMessages,
        ...(config.get('temperature') !== null
          ? { temperature: config.get('temperature') as number }
          : {}),
        ...(config.get('maxTokens') !== null
          ? { maxTokens: config.get('maxTokens') as number }
          : {}),
      })

      // Processar eventos do stream
      for await (const event of stream) {
        const result = processStreamEvent(event, assistantContent, pendingToolCalls)
        assistantContent = result.assistantContent

        if (result.yieldEvent) {
          yield result.yieldEvent
        }

        if (result.toolCall) {
          pendingToolCalls.push(result.toolCall)
        }

        if (event.type === 'finish') {
          tokens.trackUsage(event.usage.promptTokens, event.usage.completionTokens)
          yield event as OrchestratorEvent
        }

        if (event.type === 'error') {
          yield { type: 'error', error: event.error }
          return
        }
      }

      // Salvar resposta do assistente
      if (assistantContent) {
        session.addMessage(sessionId, 'assistant', assistantContent)
        llmMessages.push({ role: 'assistant', content: assistantContent })
      }

      // Processar tool calls pendentes
      if (pendingToolCalls.length > 0) {
        for (const tc of pendingToolCalls) {
          // Detectar loop
          actions.push(tc.name)
          const loopCheck = tokens.detectLoop(actions)
          if (loopCheck.detected) {
            yield {
              type: 'error',
              error: new Error(`Loop detected: ${loopCheck.pattern} (${loopCheck.repetitions}x)`),
            }
            return
          }

          // Despachar tool
          const ctx: DispatchContext = { sessionId }
          const toolResult = await toolDispatcher.dispatch(tc.name, tc.args, ctx)

          yield { type: 'tool_result', id: tc.id, name: tc.name, result: toolResult }

          // Adicionar resultado ao historico para o próximo turno
          const resultContent = toolResult.success
            ? JSON.stringify(toolResult.data)
            : `Error: ${toolResult.error}`

          llmMessages.push({ role: 'tool', content: resultContent })
        }

        // Precisa de outro turno para o LLM processar os resultados
        continueLoop = true
      }
    }
  }

  /**
   * Cria nova sessao de conversa
   * @param projectId - ID do projeto ao qual a sessao pertence
   * @param title - Titulo opcional da sessao
   * @returns Promise de Session
   */
  function createSession(projectId: string, title?: string): Promise<Session> {
    return Promise.resolve(session.create(projectId, title))
  }

  /**
   * Carrega sessao existente pelo ID
   * @param sessionId - ID da sessao a carregar
   * @returns Promise de Session
   */
  function loadSession(sessionId: string): Promise<Session> {
    return Promise.resolve(session.load(sessionId))
  }

  /**
   * Lista tools disponiveis para o LLM
   * @returns Array de ToolDefinition
   */
  function getAvailableTools(): ToolDefinition[] {
    return tools.list()
  }

  /**
   * Lista subagentes disponiveis
   * @returns Array de AgentDefinition
   */
  function getAvailableAgents(): AgentDefinition[] {
    return [...agents]
  }

  return { chat, createSession, loadSession, getAvailableTools, getAvailableAgents }
}

/**
 * Processa um evento do provider stream e retorna o que o orchestrator deve fazer.
 * @param event - Evento do provider stream
 * @param currentContent - Conteudo atual do assistente
 * @param _pendingCalls - Tool calls pendentes
 * @returns { assistantContent: string; yieldEvent?: OrchestratorEvent; toolCall?: { id: string; name: string; args: unknown } }
 */
function processStreamEvent(
  event: ProviderStreamEvent,
  currentContent: string,
  _pendingCalls: Array<{ id: string; name: string; args: unknown }>,
): {
  assistantContent: string
  yieldEvent?: OrchestratorEvent
  toolCall?: { id: string; name: string; args: unknown }
} {
  switch (event.type) {
    case 'content':
      return {
        assistantContent: currentContent + event.content,
        yieldEvent: { type: 'content', content: event.content },
      }
    case 'tool_call':
      return {
        assistantContent: currentContent,
        yieldEvent: { type: 'tool_call', id: event.id, name: event.name, args: event.args },
        toolCall: { id: event.id, name: event.name, args: event.args },
      }
    default:
      return { assistantContent: currentContent }
  }
}

/**
 * Converte mensagem do formato simples para o formato do provider.
 * @param msg - Mensagem do formato simples
 * @returns Mensagem do formato do provider
 */
function toProviderMessage(msg: { role: string; content: string }): {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
} {
  return {
    role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
    content: msg.content,
  }
}
