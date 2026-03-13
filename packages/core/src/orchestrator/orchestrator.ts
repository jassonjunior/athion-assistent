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

/** Dependencias injetadas no Orchestrator.
 * @typedef {Object} OrchestratorDeps
 * @property {ConfigManager} config - Configuracao do sistema
 * @property {Bus} bus - Bus de eventos
 * @property {ProviderLayer} provider - Provider do LLM
 * @property {ToolRegistry} tools - Registro de ferramentas
 * @property {TokenManager} tokens - Gerenciador de tokens
 * @property {SkillManager} skills - Gerenciador de skills
 * @property {SessionManager} session - Gerenciador de sessoes
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
  subagents: SubAgentManager
}

/** Cria uma instancia do Orchestrator.
 * @param deps - Dependencias injetadas
 * @returns Instancia do Orchestrator
 * @example
 * const orchestrator = createOrchestrator({ config: createConfigManager(), bus: createBus(), provider: createProviderLayer(), tools: createToolRegistry(), tokens: createTokenManager(), skills: createSkillManager(), session: createSessionManager(), promptBuilder: createPromptBuilder(), toolDispatcher: createToolDispatcher() })
 * console.log(orchestrator) // { chat: createOrchestrator({ config: createConfigManager(), bus: createBus(), provider: createProviderLayer(), tools: createToolRegistry(), tokens: createTokenManager(), skills: createSkillManager(), session: createSessionManager(), promptBuilder: createPromptBuilder(), toolDispatcher: createToolDispatcher() })
 */
/** Tipo de mensagem para o LLM (suporta content string ou array de parts para tool calls). */
type LlmMessage = {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string | unknown[]
}

/** Contexto compartilhado entre funcoes do chat. */
interface ChatContext {
  sessionId: string
  deps: OrchestratorDeps
  agents: AgentDefinition[]
  messages: Array<{ role: string; content: string }>
  llmMessages: LlmMessage[]
  actions: string[]
  /** Se true, proximo turno nao passa tools — forca resposta texto */
  forceTextOnly: boolean
  onPermissionRequest?: (toolName: string, target: string) => Promise<'allow' | 'deny'>
}

/** Resultado de um turno de streaming. */
interface TurnResult {
  assistantContent: string
  pendingToolCalls: Array<{ id: string; name: string; args: unknown }>
  hasError: boolean
}

const log = createLogger('orchestrator')

export function createOrchestrator(deps: OrchestratorDeps): Orchestrator {
  const agents: AgentDefinition[] = deps.subagents.list().map((a) => ({
    name: a.name,
    description: a.description,
    skill: a.skill,
    tools: a.tools,
  }))

  /** Inicia chat streaming com uma sessao existente.
   * @param sessionId - ID da sessao
   * @param message - Mensagem do usuario
   * @returns AsyncGenerator<OrchestratorEvent>
   * @example
   * const chat = await chat('123', { content: 'Hello, how are you?' })
   * console.log(chat) // { type: 'content', content: 'Hello, how are you?' }
   */
  async function* chat(sessionId: string, message: UserMessage): AsyncGenerator<OrchestratorEvent> {
    const ctx = await prepareChat(sessionId, message, deps, agents)

    let continueLoop = true
    let loopIteration = 0
    while (continueLoop) {
      loopIteration++
      continueLoop = false
      log.info({ loopIteration, forceTextOnly: ctx.forceTextOnly }, 'orchestrator loop iteration')

      // Verificar compactacao entre turnos
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
  }

  /** Cria uma nova sessao de conversa.
   * @param projectId - ID do projeto
   * @param title - Titulo da sessao
   * @returns Promise<Session>
   * @example
   * const session = await createSession('123', 'My Project')
   * console.log(session) // { id: '123', title: 'My Project' }
   */
  function createSession(projectId: string, title?: string): Promise<Session> {
    return Promise.resolve(deps.session.create(projectId, title))
  }

  /** Carrega uma sessao existente pelo ID.
   * @param sessionId - ID da sessao
   * @returns Promise<Session>
   * @example
   * const session = await loadSession('123')
   * console.log(session) // { id: '123', title: 'My Project' }
   */
  function loadSession(sessionId: string): Promise<Session> {
    return Promise.resolve(deps.session.load(sessionId))
  }

  /** Lista tools disponiveis para o LLM.
   * @returns ToolDefinition[]
   * @example
   * const tools = getAvailableTools()
   * console.log(tools) // [{ name: 'search', description: 'Search the web for information', parameters: { type: 'object', properties: { query: { type: 'string', description: 'The query to search for' } }, required: ['query'] } }]
   */
  function getAvailableTools(): ToolDefinition[] {
    return deps.tools.list()
  }

  /** Lista subagentes disponiveis.
   * @returns AgentDefinition[]
   * @example
   * const agents = getAvailableAgents()
   * console.log(agents) // [{ name: 'search', description: 'Search the web for information', parameters: { type: 'object', properties: { query: { type: 'string', description: 'The query to search for' } }, required: ['query'] } }]
   */
  function getAvailableAgents(): AgentDefinition[] {
    return [...agents]
  }

  function listSessions(projectId?: string): Session[] {
    return deps.session.list(projectId)
  }

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

/** Prepara o contexto do chat: carrega sessao, monta prompt, aplica compaction.
 * @param sessionId - ID da sessao
 * @param message - Mensagem do usuario
 * @param deps - Dependencias injetadas
 * @param agents - Agentes disponiveis
 * @returns ChatContext
 * @example
 * const ctx = prepareChat('123', { content: 'Hello, how are you?' }, deps, agents)
 * console.log(ctx) // { sessionId: '123', deps: deps, agents: agents, messages: [{ role: 'user', content: 'Hello, how are you?' }], llmMessages: [{ role: 'system', content: 'You are a helpful assistant.' }, { role: 'user', content: 'Hello, how are you?' }], actions: [] }
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

/** Executa um turno de streaming com o LLM.
 * @param ctx - ChatContext
 * @returns AsyncGenerator<OrchestratorEvent, TurnResult>
 * @example
 * const turn = await runStreamTurn(ctx)
 * console.log(turn) // { type: 'content', content: 'Hello, how are you?' }
 */
async function* runStreamTurn(ctx: ChatContext): AsyncGenerator<OrchestratorEvent, TurnResult> {
  const { config, provider, tokens } = ctx.deps
  let assistantContent = ''
  const pendingToolCalls: Array<{ id: string; name: string; args: unknown }> = []

  // Se forceTextOnly, nao passa tools — modelo deve gerar resposta texto
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
  /** Retorna o resultado do turno. */
  return { assistantContent, pendingToolCalls, hasError: false }
}

/** Despacha tool calls pendentes e retorna se o loop deve continuar.
 * @param ctx - ChatContext
 * @param pendingToolCalls - Tool calls pendentes
 * @returns AsyncGenerator<OrchestratorEvent, boolean>
 * @example
 * const shouldContinue = await handleToolCalls(ctx, [{ id: '123', name: 'search', args: { query: 'Hello, how are you?' } }])
 * console.log(shouldContinue) // true
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

/** Processa um evento do provider stream.
 * @param event - ProviderStreamEvent
 * @param currentContent - Conteudo atual
 * @returns { assistantContent: string; yieldEvent?: OrchestratorEvent; toolCall?: { id: string; name: string; args: unknown } }
 * @example
 * const result = processStreamEvent({ type: 'content', content: 'Hello, how are you?' }, 'Hello, how are you?')
 * console.log(result) // { assistantContent: 'Hello, how are you?', yieldEvent: { type: 'content', content: 'Hello, how are you?' } }
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

/** Converte mensagem para formato do provider.
 * @param msg - Mensagem
 * @returns { role: 'user' | 'assistant' | 'system' | 'tool'; content: string }
 * @example
 * const providerMessage = toProviderMessage({ role: 'user', content: 'Hello, how are you?' })
 * console.log(providerMessage) // { role: 'user', content: 'Hello, how are you?' }
 */
function truncateResult(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars) + `\n...[truncated: ${text.length - maxChars} chars removed]`
}

function toProviderMessage(msg: { role: string; content: string }): LlmMessage {
  return {
    role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
    content: msg.content,
  }
}
