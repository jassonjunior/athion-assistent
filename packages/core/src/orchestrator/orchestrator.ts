import { createLogger } from '../logger'
import type { Bus } from '../bus/bus'
import type { ConfigManager } from '../config/config'
import type { ProviderLayer } from '../provider/provider'
import type { StreamEvent as ProviderStreamEvent } from '../provider/types'
import type { SkillManager } from '../skills/types'
import type { SubAgentManager } from '../subagent/types'
import type { TokenManager } from '../tokens/types'
import type { ToolDefinition, ToolRegistry } from '../tools/types'
import { isOrchestratorTool } from '../tools/types'
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

/** OrchestratorDeps
 * Descrição: Dependências injetadas no Orchestrator via inversão de controle.
 */
export interface OrchestratorDeps {
  /** config
   * Descrição: Gerenciador de configuração do sistema
   */
  config: ConfigManager
  /** bus
   * Descrição: Bus de eventos para comunicação entre módulos
   */
  bus: Bus
  /** provider
   * Descrição: Camada de abstração dos provedores LLM
   */
  provider: ProviderLayer
  /** tools
   * Descrição: Registro de ferramentas disponíveis
   */
  tools: ToolRegistry
  /** tokens
   * Descrição: Gerenciador de tokens para controle de contexto
   */
  tokens: TokenManager
  /** skills
   * Descrição: Gerenciador de skills (instruções especializadas)
   */
  skills: SkillManager
  /** session
   * Descrição: Gerenciador de sessões de conversa
   */
  session: SessionManager
  /** promptBuilder
   * Descrição: Construtor do system prompt para o LLM
   */
  promptBuilder: PromptBuilder
  /** toolDispatcher
   * Descrição: Despachante de tool calls com verificação de permissões
   */
  toolDispatcher: ToolDispatcher
  /** subagents
   * Descrição: Gerenciador de subagentes especializados
   */
  subagents: SubAgentManager
}

/** LlmMessage
 * Descrição: Tipo de mensagem para o LLM (suporta content string ou array de parts para tool calls).
 */
type LlmMessage = {
  /** role
   * Descrição: Papel da mensagem na conversa
   */
  role: 'user' | 'assistant' | 'system' | 'tool'
  /** content
   * Descrição: Conteúdo da mensagem — string para texto simples, array para tool calls
   */
  content: string | unknown[]
}

/** ChatContext
 * Descrição: Contexto compartilhado entre funções do chat durante um ciclo de conversa.
 */
interface ChatContext {
  /** sessionId
   * Descrição: ID da sessão atual
   */
  sessionId: string
  /** deps
   * Descrição: Dependências injetadas do Orchestrator
   */
  deps: OrchestratorDeps
  /** agents
   * Descrição: Lista de agentes disponíveis para delegação
   */
  agents: AgentDefinition[]
  /** messages
   * Descrição: Histórico de mensagens no formato simples (role + content)
   */
  messages: Array<{ role: string; content: string }>
  /** llmMessages
   * Descrição: Mensagens formatadas para envio ao provider LLM
   */
  llmMessages: LlmMessage[]
  /** actions
   * Descrição: Lista de nomes de tools chamadas neste ciclo, usada para detecção de loops
   */
  actions: string[]
  /** forceTextOnly
   * Descrição: Se true, próximo turno não passa tools — força resposta texto
   */
  forceTextOnly: boolean
  /** onPermissionRequest
   * Descrição: Callback para resolução interativa de permissão (opcional)
   * @param toolName - Nome da tool
   * @param target - Alvo da operação
   * @returns Promise com 'allow' ou 'deny'
   */
  onPermissionRequest?: (toolName: string, target: string) => Promise<'allow' | 'deny'>
}

/** TurnResult
 * Descrição: Resultado de um turno de streaming com o LLM.
 */
interface TurnResult {
  /** assistantContent
   * Descrição: Conteúdo textual gerado pelo assistente neste turno
   */
  assistantContent: string
  /** pendingToolCalls
   * Descrição: Tool calls pendentes que precisam ser executadas
   */
  pendingToolCalls: Array<{ id: string; name: string; args: unknown }>
  /** hasError
   * Descrição: Indica se ocorreu erro durante o turno
   */
  hasError: boolean
}

const log = createLogger('orchestrator')

/** createOrchestrator
 * Descrição: Cria uma instância do Orchestrator que coordena chat, sessões e delegação para subagentes.
 * @param deps - Dependências injetadas via inversão de controle
 * @returns Instância do Orchestrator
 */
export function createOrchestrator(deps: OrchestratorDeps): Orchestrator {
  const agents: AgentDefinition[] = deps.subagents.list().map((a) => ({
    name: a.name,
    description: a.description,
    skill: a.skill,
    tools: a.tools,
  }))

  /** chat
   * Descrição: Inicia chat streaming com uma sessão existente, executando loop de turnos com tools
   * @param sessionId - ID da sessão
   * @param message - Mensagem do usuário
   * @returns AsyncGenerator que emite OrchestratorEvent
   */
  async function* chat(sessionId: string, message: UserMessage): AsyncGenerator<OrchestratorEvent> {
    const ctx = await prepareChat(sessionId, message, deps, agents)

    let continueLoop = true
    let loopIteration = 0
    while (continueLoop) {
      loopIteration++
      continueLoop = false
      log.info({ loopIteration, forceTextOnly: ctx.forceTextOnly }, 'orchestrator loop iteration')

      // Verificar compactação entre turnos
      if (deps.tokens.needsCompaction()) {
        await deps.session.compress(sessionId)
        const compacted = deps.session.getMessages(sessionId)
        ctx.messages.length = 0
        ctx.messages.push(...compacted)
        const systemPrompt = ctx.llmMessages[0]
        ctx.llmMessages.length = 0
        ctx.llmMessages.push(systemPrompt, ...compacted.map(toProviderMessage))
      }

      const turn: TurnResult = yield* runStreamTurn(ctx)

      if (turn.hasError) return

      if (turn.pendingToolCalls.length > 0) {
        // Monta mensagem assistant com tool calls no formato AI SDK v6
        const assistantParts: unknown[] = []
        if (turn.assistantContent) {
          assistantParts.push({ type: 'text', text: turn.assistantContent })
        }
        for (const tc of turn.pendingToolCalls) {
          assistantParts.push({
            type: 'tool-call',
            toolCallId: tc.id,
            toolName: tc.name,
            input: tc.args,
          })
        }
        ctx.llmMessages.push({ role: 'assistant', content: assistantParts })

        if (turn.assistantContent) {
          deps.session.addMessage(sessionId, 'assistant', turn.assistantContent)
        }

        const shouldContinue: boolean = yield* handleToolCalls(ctx, turn.pendingToolCalls)
        log.info({ shouldContinue, forceTextOnly: ctx.forceTextOnly }, 'handleToolCalls returned')
        if (!shouldContinue) return
        continueLoop = true
      } else if (turn.assistantContent) {
        log.info(
          { loopIteration, contentLength: turn.assistantContent.length },
          'orchestrator final response',
        )
        deps.session.addMessage(sessionId, 'assistant', turn.assistantContent)
        ctx.llmMessages.push({ role: 'assistant', content: turn.assistantContent })
      } else {
        log.warn(
          {
            loopIteration,
            hasContent: !!turn.assistantContent,
            pendingToolCalls: turn.pendingToolCalls.length,
          },
          'orchestrator turn produced no content and no tool calls',
        )
      }
    }
    log.info({ loopIteration }, 'orchestrator chat loop ended')
    // Libera referências pesadas — session já persistiu tudo
    ctx.llmMessages.length = 0
    ctx.actions.length = 0
  }

  /** createSession
   * Descrição: Cria uma nova sessão de conversa para um projeto
   * @param projectId - ID do projeto
   * @param title - Título opcional da sessão
   * @returns Promise com a sessão criada
   */
  function createSession(projectId: string, title?: string): Promise<Session> {
    return Promise.resolve(deps.session.create(projectId, title))
  }

  /** loadSession
   * Descrição: Carrega uma sessão existente pelo ID
   * @param sessionId - ID da sessão a carregar
   * @returns Promise com a sessão carregada
   */
  function loadSession(sessionId: string): Promise<Session> {
    return Promise.resolve(deps.session.load(sessionId))
  }

  /** getAvailableTools
   * Descrição: Lista todas as tools disponíveis registradas no sistema
   * @returns Array de ToolDefinition
   */
  function getAvailableTools(): ToolDefinition[] {
    return deps.tools.list()
  }

  /** getAvailableAgents
   * Descrição: Lista todos os subagentes disponíveis para delegação
   * @returns Array de AgentDefinition
   */
  function getAvailableAgents(): AgentDefinition[] {
    return [...agents]
  }

  /** listSessions
   * Descrição: Lista sessões, opcionalmente filtradas por projeto
   * @param projectId - ID do projeto para filtrar (opcional)
   * @returns Array de sessões
   */
  function listSessions(projectId?: string): Session[] {
    return deps.session.list(projectId)
  }

  /** deleteSession
   * Descrição: Deleta uma sessão e todas as suas mensagens
   * @param sessionId - ID da sessão a deletar
   */
  function deleteSession(sessionId: string): void {
    deps.session.delete(sessionId)
  }

  return {
    chat,
    createSession,
    loadSession,
    listSessions,
    deleteSession,
    getAvailableTools,
    getAvailableAgents,
  }
}

/** prepareChat
 * Descrição: Prepara o contexto do chat: carrega sessão, monta prompt e aplica compactação se necessário
 * @param sessionId - ID da sessão
 * @param message - Mensagem do usuário
 * @param deps - Dependências injetadas
 * @param agents - Agentes disponíveis
 * @returns Promise com o ChatContext preparado
 */
async function prepareChat(
  sessionId: string,
  message: UserMessage,
  deps: OrchestratorDeps,
  agents: AgentDefinition[],
): Promise<ChatContext> {
  const { session, tokens, promptBuilder, tools } = deps

  const currentSession = session.load(sessionId)
  const messages = session.getMessages(sessionId)

  session.addMessage(sessionId, 'user', message.content)
  messages.push({ role: 'user', content: message.content })

  const systemPrompt = promptBuilder.build(currentSession, tools.list(), agents)

  if (tokens.needsCompaction()) {
    await session.compress(sessionId)
    const compacted = session.getMessages(sessionId)
    messages.length = 0
    messages.push(...compacted)
  }

  const llmMessages: LlmMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map(toProviderMessage),
  ]

  const ctx: ChatContext = {
    sessionId,
    deps,
    agents,
    messages,
    llmMessages,
    actions: [],
    forceTextOnly: false,
  }
  if (message.onPermissionRequest) ctx.onPermissionRequest = message.onPermissionRequest
  return ctx
}

/** runStreamTurn
 * Descrição: Executa um turno de streaming com o LLM, coletando conteúdo e tool calls
 * @param ctx - Contexto do chat com estado acumulado
 * @returns AsyncGenerator que emite OrchestratorEvent e retorna TurnResult
 */
async function* runStreamTurn(ctx: ChatContext): AsyncGenerator<OrchestratorEvent, TurnResult> {
  const { config, provider, tokens } = ctx.deps
  let assistantContent = ''
  const pendingToolCalls: Array<{ id: string; name: string; args: unknown }> = []

  // Se forceTextOnly, não passa tools — modelo deve gerar resposta texto
  // Usa tool.level para filtrar: só envia tools com level='orchestrator' ao provider.
  let providerTools: Record<string, { description: string; parameters: unknown }> | undefined
  if (!ctx.forceTextOnly) {
    const directTools = ctx.deps.tools.list().filter((t) => isOrchestratorTool(t))
    if (directTools.length > 0) {
      providerTools = {}
      for (const t of directTools) {
        providerTools[t.name] = { description: t.description, parameters: t.parameters }
      }
    }
  }

  const stream = provider.streamChat({
    provider: config.get('provider') as string,
    model: (config.get('orchestratorModel') ?? config.get('model')) as string,
    messages: ctx.llmMessages,
    ...(providerTools ? { tools: providerTools } : {}),
    ...(config.get('temperature') !== null
      ? { temperature: config.get('temperature') as number }
      : {}),
    maxTokens: (config.get('maxTokens') ?? config.get('maxOutputTokens') ?? 8192) as number,
  })

  for await (const event of stream) {
    // Propagar eventos de swap de modelo diretamente para o cliente
    if (event.type === 'model_loading' || event.type === 'model_ready') {
      yield event as OrchestratorEvent
      continue
    }

    const result = processStreamEvent(event, assistantContent)
    assistantContent = result.assistantContent

    // Se forceTextOnly, ignorar tool calls alucinados pelo modelo local
    if (ctx.forceTextOnly && result.toolCall) continue
    if (result.yieldEvent) yield result.yieldEvent
    if (result.toolCall) pendingToolCalls.push(result.toolCall)

    if (event.type === 'finish') {
      tokens.trackUsage(event.usage.promptTokens, event.usage.completionTokens)
      yield event as OrchestratorEvent
    }

    if (event.type === 'error') {
      yield { type: 'error', error: event.error }
      return { assistantContent, pendingToolCalls: [], hasError: true }
    }
  }
  return { assistantContent, pendingToolCalls, hasError: false }
}

/** handleToolCalls
 * Descrição: Despacha tool calls pendentes, verifica permissões e retorna se o loop deve continuar
 * @param ctx - Contexto do chat
 * @param pendingToolCalls - Tool calls pendentes a serem executadas
 * @returns AsyncGenerator que emite OrchestratorEvent e retorna boolean indicando continuação
 */
async function* handleToolCalls(
  ctx: ChatContext,
  pendingToolCalls: Array<{ id: string; name: string; args: unknown }>,
): AsyncGenerator<OrchestratorEvent, boolean> {
  const { tokens, toolDispatcher } = ctx.deps

  for (const tc of pendingToolCalls) {
    // Bloqueia tools com level='agent' — orchestrator não pode chamar diretamente
    const toolDef = ctx.deps.tools.get(tc.name)
    if (toolDef && !isOrchestratorTool(toolDef)) {
      const errorMsg = `Tool "${tc.name}" is not available directly. Use the "task" tool to delegate to the appropriate agent.`
      const failResult = { success: false as const, error: errorMsg }
      yield { type: 'tool_result', id: tc.id, name: tc.name, result: failResult }
      ctx.llmMessages.push({
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
      continue
    }

    ctx.actions.push(tc.name)
    const loopCheck = tokens.detectLoop(ctx.actions)
    if (loopCheck.detected) {
      yield {
        type: 'error',
        error: new Error(`Loop detected: ${loopCheck.pattern} (${loopCheck.repetitions}x)`),
      }
      return false
    }

    // Emitir subagent_start antes de executar
    const taskArgs = tc.args as { agent?: string }
    const agentName = taskArgs.agent ?? 'unknown'
    yield { type: 'subagent_start', agentName }

    const dispatchCtx: DispatchContext = { sessionId: ctx.sessionId }
    if (ctx.onPermissionRequest) dispatchCtx.onPermissionRequest = ctx.onPermissionRequest
    const toolResult = await toolDispatcher.dispatch(tc.name, tc.args, dispatchCtx)

    // Emitir subagent_complete após executar
    yield {
      type: 'subagent_complete',
      agentName,
      result: toolResult.success ? toolResult.data : null,
    }
    yield { type: 'tool_result', id: tc.id, name: tc.name, result: toolResult }

    const rawText = toolResult.success
      ? JSON.stringify(toolResult.data)
      : `Error: ${toolResult.error}`
    const resultText = truncateResult(rawText, 10_000)

    ctx.llmMessages.push({
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

    // Após task bem sucedida, forçar próximo turno sem tools
    if (toolResult.success) {
      ctx.forceTextOnly = true
    }
  }

  return true
}

/** processStreamEvent
 * Descrição: Processa um evento do provider stream, extraindo conteúdo e tool calls
 * @param event - Evento recebido do provider
 * @param currentContent - Conteúdo acumulado do assistente até agora
 * @returns Objeto com conteúdo atualizado, evento para emitir e tool call (se houver)
 */
function processStreamEvent(
  event: ProviderStreamEvent,
  currentContent: string,
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

/** truncateResult
 * Descrição: Trunca texto de resultado se exceder o limite de caracteres
 * @param text - Texto a ser truncado
 * @param maxChars - Número máximo de caracteres permitidos
 * @returns Texto truncado com indicação de quantos caracteres foram removidos
 */
function truncateResult(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + `\n...[truncated: ${text.length - maxChars} chars removed]`
}

/** toProviderMessage
 * Descrição: Converte mensagem do formato simples para o formato do provider LLM
 * @param msg - Mensagem com role e content como strings
 * @returns Mensagem no formato LlmMessage
 */
function toProviderMessage(msg: { role: string; content: string }): LlmMessage {
  return {
    role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
    content: msg.content,
  }
}
