/**
 * Handlers para cada método JSON-RPC.
 * Descrição: Define os handlers que processam requisições JSON-RPC do servidor stdio.
 *
 * Cada handler recebe params e retorna result (ou throws para error).
 * O handler `chat.send` é especial: consome o AsyncGenerator do orchestrator
 * e envia cada OrchestratorEvent como notificação JSON-RPC ao client.
 */

import type { AthionCore } from '@athion/core'

/** NotifyFn
 * Descrição: Tipo de função para enviar notificações JSON-RPC ao cliente.
 */
type NotifyFn = (method: string, params?: unknown) => void

/** Handler
 * Descrição: Tipo de função handler que processa uma requisição JSON-RPC.
 */
type Handler = (params: unknown) => Promise<unknown>

/** RpcHandlers
 * Descrição: Mapa de handlers JSON-RPC indexados pelo nome do método.
 */
export type RpcHandlers = Record<string, Handler>

/** activeChats
 * Descrição: Mapa de AbortControllers ativos para sessões de chat em andamento.
 */
const activeChats = new Map<string, AbortController>()

/** IGNORED_DIRS
 * Descrição: Conjunto de diretórios ignorados na busca de arquivos por prefixo.
 */
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', 'coverage'])

/** createHandlers
 * Descrição: Cria e retorna todos os handlers JSON-RPC disponíveis no servidor.
 * @param core - Instância do core do Athion para processamento das requisições
 * @param notify - Função para enviar notificações JSON-RPC ao cliente
 * @returns Mapa de handlers indexados pelo nome do método JSON-RPC
 */
export function createHandlers(core: AthionCore, notify: NotifyFn): RpcHandlers {
  return {
    ping: async () => ({ pong: true, timestamp: Date.now() }),
    'chat.send': (params: unknown) => handleChatSend(core, notify, params),
    'chat.abort': (params: unknown) => handleChatAbort(params),
    'session.create': (params: unknown) => handleSessionCreate(core, params),
    'session.list': (params: unknown) => handleSessionList(core, params),
    'session.load': (params: unknown) => handleSessionLoad(core, params),
    'session.delete': (params: unknown) => handleSessionDelete(core, params),
    'config.get': (params: unknown) => handleConfigGet(core, params),
    'config.set': (params: unknown) => handleConfigSet(core, params),
    'config.list': async () => core.config.getAll(),
    'tools.list': async () => handleToolsList(core),
    'agents.list': async () => handleAgentsList(core),
    'completion.complete': (params: unknown) => handleCompletion(core, params),
    // Codebase indexer
    'codebase.index': (params: unknown) => handleCodebaseIndex(core, notify, params),
    'codebase.search': (params: unknown) => handleCodebaseSearch(core, params),
    'codebase.status': async () => handleCodebaseStatus(core),
    'codebase.clear': async () => handleCodebaseClear(core),
    // Plugin/Skills discovery
    'plugin.search': (params: unknown) => handlePluginSearch(core, params),
    'plugin.install': (params: unknown) => handlePluginInstall(core, params),
    // Skill activation
    'skill.list': async () =>
      core.skills
        .list()
        .map((s) => ({ name: s.name, description: s.description, triggers: s.triggers })),
    'skill.setActive': (params: unknown) => {
      const { name } = params as { name: string }
      core.skills.setActive(name)
      return Promise.resolve({ ok: true, name })
    },
    'skill.clearActive': async () => {
      core.skills.clearActive()
      return { ok: true }
    },
    'skill.getActive': async () => {
      const s = core.skills.getActive()
      return s ? { name: s.name, description: s.description } : null
    },
    // File prefix search (for autocomplete)
    'files.list': async (params: unknown) => {
      const { prefix = '', cwd } = params as { prefix?: string; cwd?: string }
      const files = await listFilesByPrefix(prefix, cwd ?? process.cwd())
      return { files }
    },
  }
}

// ─── File Search ─────────────────────────────────────────────────────

/** listFilesByPrefix
 * Descrição: Busca arquivos no workspace por prefixo, ignorando diretórios comuns.
 * @param prefix - Prefixo para filtrar arquivos (suporta caminhos parciais)
 * @param cwd - Diretório de trabalho para a busca
 * @param limit - Número máximo de resultados (padrão: 10)
 * @returns Promise com array de caminhos de arquivos encontrados
 */
async function listFilesByPrefix(prefix: string, cwd: string, limit = 10): Promise<string[]> {
  const results: string[] = []
  try {
    // Pattern: if prefix contains '/', treat as path — else search filename anywhere
    const pattern = prefix.includes('/') ? `${prefix}*` : `**/*${prefix}*`
    const glob = new Bun.Glob(pattern)
    for await (const file of glob.scan({ cwd, onlyFiles: true })) {
      const parts = file.split('/')
      if (parts.some((p) => IGNORED_DIRS.has(p))) continue
      results.push(file)
      if (results.length >= limit) break
    }
  } catch {
    // ignore glob errors (invalid pattern etc)
  }
  return results
}

// ─── Chat Handlers ──────────────────────────────────────────────────

/** handleChatSend
 * Descrição: Processa o envio de uma mensagem de chat, consumindo o stream do orchestrator
 * e enviando cada evento como notificação JSON-RPC ao cliente.
 * @param core - Instância do core do Athion
 * @param notify - Função de notificação JSON-RPC
 * @param params - Parâmetros contendo sessionId e content da mensagem
 * @returns Promise com indicador de sucesso
 */
async function handleChatSend(
  core: AthionCore,
  notify: NotifyFn,
  params: unknown,
): Promise<unknown> {
  const { sessionId, content } = params as { sessionId: string; content: string }
  activeChats.get(sessionId)?.abort()

  const controller = new AbortController()
  activeChats.set(sessionId, controller)

  try {
    const stream = core.orchestrator.chat(sessionId, { content })
    for await (const event of stream) {
      if (controller.signal.aborted) break
      notifyChatEvent(notify, event)
    }
  } finally {
    activeChats.delete(sessionId)
  }

  return { ok: true }
}

/** notifyChatEvent
 * Descrição: Converte um evento do orchestrator em notificação JSON-RPC e a envia ao cliente.
 * @param notify - Função de notificação JSON-RPC
 * @param event - Evento do orchestrator a ser convertido e enviado
 */
function notifyChatEvent(notify: NotifyFn, event: { type: string; [key: string]: unknown }): void {
  switch (event.type) {
    case 'content':
      notify('chat.event', { type: 'content', content: event.content })
      break
    case 'tool_call':
      notify('chat.event', { type: 'tool_call', id: event.id, name: event.name, args: event.args })
      break
    case 'tool_result': {
      const result = event.result as { success: boolean; data?: unknown; error?: unknown }
      notify('chat.event', {
        type: 'tool_result',
        id: event.id,
        name: event.name,
        success: result.success,
        preview: result.success ? JSON.stringify(result.data).slice(0, 500) : String(result.error),
      })
      break
    }
    case 'subagent_start':
      notify('chat.event', { type: 'subagent_start', agentName: event.agentName })
      break
    case 'subagent_progress':
      notify('chat.event', {
        type: 'subagent_progress',
        agentName: event.agentName,
        data: event.data,
      })
      break
    case 'subagent_complete':
      notify('chat.event', {
        type: 'subagent_complete',
        agentName: event.agentName,
        result: event.result,
      })
      break
    case 'subagent_continuation':
      notify('chat.event', {
        type: 'subagent_continuation',
        agentName: event.agentName,
        continuationIndex: event.continuationIndex,
      })
      break
    case 'finish': {
      const usage = event.usage as { promptTokens: number; completionTokens: number }
      notify('chat.event', {
        type: 'finish',
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
      })
      break
    }
    case 'error':
      notify('chat.event', { type: 'error', message: (event.error as { message: string }).message })
      break
    case 'model_loading':
      notify('chat.event', { type: 'model_loading', modelName: event.modelName as string })
      break
    case 'model_ready':
      notify('chat.event', { type: 'model_ready', modelName: event.modelName as string })
      break
  }
}

/** handleChatAbort
 * Descrição: Aborta uma sessão de chat em andamento pelo seu sessionId.
 * @param params - Parâmetros contendo o sessionId da sessão a ser abortada
 * @returns Promise com indicador se houve aborto
 */
async function handleChatAbort(params: unknown): Promise<unknown> {
  const { sessionId } = params as { sessionId: string }
  const controller = activeChats.get(sessionId)
  if (controller) {
    controller.abort()
    activeChats.delete(sessionId)
  }
  return { aborted: !!controller }
}

// ─── Session Handlers ───────────────────────────────────────────────

/** handleSessionCreate
 * Descrição: Cria uma nova sessão de conversa no orchestrator.
 * @param core - Instância do core do Athion
 * @param params - Parâmetros contendo projectId e título opcional
 * @returns Promise com dados da sessão criada
 */
async function handleSessionCreate(core: AthionCore, params: unknown): Promise<unknown> {
  const { projectId, title } = params as { projectId: string; title?: string }
  const session = await core.orchestrator.createSession(projectId, title)
  return {
    id: session.id,
    projectId: session.projectId,
    title: session.title,
    createdAt: session.createdAt,
  }
}

/** handleSessionList
 * Descrição: Lista todas as sessões, opcionalmente filtradas por projectId.
 * @param core - Instância do core do Athion
 * @param params - Parâmetros contendo projectId opcional para filtragem
 * @returns Promise com array de sessões serializadas
 */
async function handleSessionList(core: AthionCore, params: unknown): Promise<unknown> {
  const { projectId } = (params as { projectId?: string }) ?? {}
  return core.orchestrator.listSessions(projectId).map((s) => ({
    id: s.id,
    projectId: s.projectId,
    title: s.title,
    createdAt: s.createdAt,
  }))
}

/** handleSessionLoad
 * Descrição: Carrega uma sessão existente pelo seu ID.
 * @param core - Instância do core do Athion
 * @param params - Parâmetros contendo o sessionId da sessão a ser carregada
 * @returns Promise com dados da sessão carregada
 */
async function handleSessionLoad(core: AthionCore, params: unknown): Promise<unknown> {
  const { sessionId } = params as { sessionId: string }
  const session = await core.orchestrator.loadSession(sessionId)
  return {
    id: session.id,
    projectId: session.projectId,
    title: session.title,
    createdAt: session.createdAt,
  }
}

/** handleSessionDelete
 * Descrição: Deleta uma sessão pelo seu ID.
 * @param core - Instância do core do Athion
 * @param params - Parâmetros contendo o sessionId da sessão a ser deletada
 * @returns Promise com indicador de exclusão
 */
async function handleSessionDelete(core: AthionCore, params: unknown): Promise<unknown> {
  const { sessionId } = params as { sessionId: string }
  core.orchestrator.deleteSession(sessionId)
  return { deleted: true }
}

// ─── Config Handlers ────────────────────────────────────────────────

/** handleConfigGet
 * Descrição: Obtém o valor de uma chave de configuração.
 * @param core - Instância do core do Athion
 * @param params - Parâmetros contendo a chave de configuração
 * @returns Promise com a chave e seu valor
 */
async function handleConfigGet(core: AthionCore, params: unknown): Promise<unknown> {
  const { key } = params as { key: string }
  return { key, value: core.config.get(key as never) }
}

/** handleConfigSet
 * Descrição: Define o valor de uma chave de configuração.
 * @param core - Instância do core do Athion
 * @param params - Parâmetros contendo a chave e o valor a ser definido
 * @returns Promise com indicador de sucesso
 */
async function handleConfigSet(core: AthionCore, params: unknown): Promise<unknown> {
  const { key, value } = params as { key: string; value: unknown }
  core.config.set(key as never, value as never)
  return { ok: true }
}

// ─── List Handlers ──────────────────────────────────────────────────

/** handleToolsList
 * Descrição: Lista todas as ferramentas disponíveis no core.
 * @param core - Instância do core do Athion
 * @returns Array de ferramentas com nome, descrição e nível
 */
function handleToolsList(core: AthionCore): unknown {
  return core.tools
    .list()
    .map((t) => ({ name: t.name, description: t.description, level: t.level }))
}

/** handleAgentsList
 * Descrição: Lista todos os agentes disponíveis no core.
 * @param core - Instância do core do Athion
 * @returns Array de agentes com nome e descrição
 */
function handleAgentsList(core: AthionCore): unknown {
  return core.subagents.list().map((a) => ({ name: a.name, description: a.description }))
}

// ─── Codebase Handlers ──────────────────────────────────────────────

/** handleCodebaseIndex
 * Descrição: Indexa o workspace ou um arquivo específico, enviando progresso via notificações.
 * @param core - Instância do core do Athion
 * @param notify - Função de notificação JSON-RPC para enviar progresso
 * @param params - Parâmetros contendo arquivo específico opcional para re-indexação
 * @returns Promise com estatísticas da indexação ou indicador de sucesso
 */
async function handleCodebaseIndex(
  core: AthionCore,
  notify: NotifyFn,
  params: unknown,
): Promise<unknown> {
  if (!core.indexer) {
    throw new Error('Indexer não configurado. Inicie o servidor com --workspace=<path>')
  }

  const { file } = (params as { file?: string }) ?? {}

  if (file) {
    // Re-indexa um arquivo específico
    await core.indexer.indexFile(file)
    notify('codebase.event', { type: 'file_indexed', file })
    return { ok: true, file }
  }

  // Indexa o workspace completo com progresso via notificações
  const stats = await core.indexer.indexWorkspace((indexed, total, currentFile) => {
    notify('codebase.event', { type: 'progress', indexed, total, currentFile })
  })

  notify('codebase.event', { type: 'done', stats })
  return stats
}

/** handleCodebaseSearch
 * Descrição: Busca semanticamente no índice do codebase.
 * @param core - Instância do core do Athion
 * @param params - Parâmetros contendo a query de busca e limite opcional de resultados
 * @returns Promise com os resultados da busca formatados
 */
async function handleCodebaseSearch(core: AthionCore, params: unknown): Promise<unknown> {
  if (!core.indexer) {
    throw new Error('Indexer não configurado.')
  }

  const { query, limit } = params as { query: string; limit?: number }
  const results = await core.indexer.search(query, limit ?? 8)

  return {
    results: results.map((r) => ({
      file: r.chunk.filePath,
      startLine: r.chunk.startLine,
      endLine: r.chunk.endLine,
      language: r.chunk.language,
      symbolName: r.chunk.symbolName,
      chunkType: r.chunk.chunkType,
      score: Math.round(r.score * 100) / 100,
      source: r.source,
      content: r.chunk.content,
    })),
  }
}

/** handleCodebaseStatus
 * Descrição: Retorna as estatísticas do índice de busca do codebase.
 * @param core - Instância do core do Athion
 * @returns Objeto com status de disponibilidade e estatísticas do índice
 */
function handleCodebaseStatus(core: AthionCore): unknown {
  if (!core.indexer) {
    return { available: false, reason: 'Indexer não configurado.' }
  }
  const stats = core.indexer.getStats()
  return { available: true, ...stats }
}

/** handleCodebaseClear
 * Descrição: Limpa todos os dados do índice de busca do codebase.
 * @param core - Instância do core do Athion
 * @returns Objeto com indicador de sucesso
 */
function handleCodebaseClear(core: AthionCore): unknown {
  if (!core.indexer) {
    throw new Error('Indexer não configurado.')
  }
  core.indexer.clear()
  return { ok: true }
}

// ─── Plugin/Skills Handlers ─────────────────────────────────────────

/** handlePluginSearch
 * Descrição: Busca skills no registry local e/ou no GitHub.
 * @param core - Instância do core do Athion
 * @param params - Parâmetros contendo query opcional para busca no GitHub
 * @returns Promise com lista de skills encontradas
 */
async function handlePluginSearch(core: AthionCore, params: unknown): Promise<unknown> {
  const { query } = (params as { query?: string }) ?? {}

  if (query) {
    const results = await core.skillRegistry.searchGitHub(query)
    return {
      results: results.map((r) => ({
        pluginName: r.name,
        packageName: r.repo ? `${r.repo}/${r.name}` : r.name,
        description: r.description,
        version: r.source === 'github' ? 'github' : 'bundled',
        author: r.repo ?? 'athion',
        tags: [r.source],
        installed: r.installed,
      })),
    }
  }

  const local = core.skillRegistry.search()
  return {
    results: local.map((r) => ({
      pluginName: r.name,
      packageName: r.name,
      description: r.description,
      version: 'bundled',
      author: r.author,
      tags: r.tags,
      installed: core.skillRegistry.isInstalled(r.name),
    })),
  }
}

/** handlePluginInstall
 * Descrição: Instala uma skill a partir do registry.
 * @param core - Instância do core do Athion
 * @param params - Parâmetros contendo o nome da skill a ser instalada
 * @returns Promise com resultado da instalação
 */
async function handlePluginInstall(core: AthionCore, params: unknown): Promise<unknown> {
  const { name } = params as { name: string }
  const result = await core.skillRegistry.install(name)
  return { ...result, pluginName: name, packageName: name }
}

// ─── Completion Handler ─────────────────────────────────────────────

/** handleCompletion
 * Descrição: Gera completação de código usando o modelo LLM via fill-in-middle (FIM).
 * @param core - Instância do core do Athion
 * @param params - Parâmetros contendo prefix, suffix, language e filePath do código
 * @returns Promise com o texto completado, linguagem e motivo de finalização
 */
async function handleCompletion(core: AthionCore, params: unknown): Promise<unknown> {
  const { prefix, suffix, language } = params as {
    prefix: string
    suffix: string
    language: string
    filePath: string
  }

  const fimPrompt = `<fim_prefix>${prefix}<fim_suffix>${suffix}<fim_middle>`
  const model = core.config.get('model')
  const provider = core.config.get('provider')

  const stream = core.provider.streamChat({
    provider,
    model,
    messages: [{ role: 'user', content: fimPrompt }],
    temperature: 0.2,
    maxTokens: 256,
  })

  let text = ''
  for await (const event of stream) {
    if (event.type === 'content') text += event.content
  }

  text = text
    .replace(/<fim_prefix>|<fim_suffix>|<fim_middle>|<\|endoftext\|>/g, '')
    .replace(/^\n/, '')

  return { text, language, finishReason: 'stop' }
}
