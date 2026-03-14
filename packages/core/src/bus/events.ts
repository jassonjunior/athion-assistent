import { z } from 'zod/v4'
import { defineBusEvent } from './bus'

// ─── Stream Events ──────────────────────────────────────────────

/** StreamStart
 * Descrição: Evento emitido quando um stream de resposta do LLM é iniciado.
 * Payload contém o ID da sessão.
 */
export const StreamStart = defineBusEvent(
  'stream.start',
  z.object({
    /** sessionId - Identificador único da sessão */
    sessionId: z.string(),
  }),
)

/** StreamContent
 * Descrição: Evento emitido para cada fragmento de conteúdo recebido do LLM durante o stream.
 * Payload contém o texto parcial e o índice do fragmento.
 */
export const StreamContent = defineBusEvent(
  'stream.content',
  z.object({
    /** sessionId - Identificador único da sessão */
    sessionId: z.string(),
    /** content - Fragmento de texto recebido do LLM */
    content: z.string(),
    /** index - Índice sequencial do fragmento no stream */
    index: z.number(),
  }),
)

/** StreamToolCall
 * Descrição: Evento emitido quando o LLM solicita a execução de uma ferramenta durante o stream.
 * Payload contém o nome da ferramenta e os argumentos.
 */
export const StreamToolCall = defineBusEvent(
  'stream.tool_call',
  z.object({
    /** sessionId - Identificador único da sessão */
    sessionId: z.string(),
    /** toolName - Nome da ferramenta a ser executada */
    toolName: z.string(),
    /** args - Argumentos para a ferramenta */
    args: z.unknown(),
  }),
)

/** StreamToolResult
 * Descrição: Evento emitido quando uma ferramenta retorna seu resultado durante o stream.
 * Payload contém o nome da ferramenta e o resultado.
 */
export const StreamToolResult = defineBusEvent(
  'stream.tool_result',
  z.object({
    /** sessionId - Identificador único da sessão */
    sessionId: z.string(),
    /** toolName - Nome da ferramenta que foi executada */
    toolName: z.string(),
    /** result - Resultado da execução da ferramenta */
    result: z.unknown(),
  }),
)

/** StreamComplete
 * Descrição: Evento emitido quando o stream de resposta do LLM é finalizado.
 * Payload contém o ID da sessão.
 */
export const StreamComplete = defineBusEvent(
  'stream.complete',
  z.object({
    /** sessionId - Identificador único da sessão */
    sessionId: z.string(),
  }),
)

// ─── Subagent Events ────────────────────────────────────────────

/** SubagentStart
 * Descrição: Evento emitido quando um subagente inicia a execução de uma tarefa.
 */
export const SubagentStart = defineBusEvent(
  'subagent.start',
  z.object({
    /** sessionId - Identificador único da sessão */
    sessionId: z.string(),
    /** agentName - Nome do subagente que está sendo executado */
    agentName: z.string(),
  }),
)

/** SubagentProgress
 * Descrição: Evento emitido para reportar progresso parcial de um subagente.
 */
export const SubagentProgress = defineBusEvent(
  'subagent.progress',
  z.object({
    /** sessionId - Identificador único da sessão */
    sessionId: z.string(),
    /** agentName - Nome do subagente */
    agentName: z.string(),
    /** data - Dados de progresso (formato variável por agente) */
    data: z.unknown(),
  }),
)

/** SubagentComplete
 * Descrição: Evento emitido quando um subagente finaliza sua tarefa.
 */
export const SubagentComplete = defineBusEvent(
  'subagent.complete',
  z.object({
    /** sessionId - Identificador único da sessão */
    sessionId: z.string(),
    /** agentName - Nome do subagente */
    agentName: z.string(),
    /** result - Resultado final da execução do subagente */
    result: z.unknown(),
  }),
)

// ─── System Events ──────────────────────────────────────────────

/** PermissionRequest
 * Descrição: Evento emitido quando uma ação precisa de aprovação do usuário.
 */
export const PermissionRequest = defineBusEvent(
  'permission.request',
  z.object({
    /** action - Ação que está sendo solicitada (ex: 'write', 'bash') */
    action: z.string(),
    /** target - Alvo da ação (ex: caminho do arquivo, comando) */
    target: z.string(),
  }),
)

/** ConfigChanged
 * Descrição: Evento emitido quando uma configuração é alterada em runtime.
 */
export const ConfigChanged = defineBusEvent(
  'config.changed',
  z.object({
    /** key - Nome da chave de configuração que foi alterada */
    key: z.string(),
    /** value - Novo valor atribuído à chave */
    value: z.unknown(),
  }),
)

// ─── Plugin Events ───────────────────────────────────────────────

/** PluginLoaded
 * Descrição: Evento emitido quando um plugin é carregado com sucesso.
 */
export const PluginLoaded = defineBusEvent(
  'plugin.loaded',
  z.object({
    /** name - Nome do plugin carregado */
    name: z.string(),
    /** version - Versão do plugin */
    version: z.string(),
    /** toolsRegistered - Lista de nomes das ferramentas registradas pelo plugin */
    toolsRegistered: z.array(z.string()),
  }),
)

/** PluginUnloaded
 * Descrição: Evento emitido quando um plugin é descarregado.
 */
export const PluginUnloaded = defineBusEvent(
  'plugin.unloaded',
  z.object({
    /** name - Nome do plugin descarregado */
    name: z.string(),
  }),
)

/** PluginError
 * Descrição: Evento emitido quando um plugin falha ao carregar.
 */
export const PluginError = defineBusEvent(
  'plugin.error',
  z.object({
    /** name - Nome do plugin que falhou */
    name: z.string(),
    /** error - Mensagem de erro descrevendo a falha */
    error: z.string(),
  }),
)

// ─── Codebase Indexing Events ───────────────────────────────────────────

/** FileChanged
 * Descrição: Evento emitido quando um arquivo do workspace é adicionado, modificado ou removido.
 * Usado pelo FileWatcher (Fase 5) para disparar re-indexação incremental.
 */
export const FileChanged = defineBusEvent(
  'codebase.file_changed',
  z.object({
    /** filePath - Caminho absoluto do arquivo alterado */
    filePath: z.string(),
    /** event - Tipo de alteração detectada */
    event: z.enum(['add', 'change', 'unlink']),
    /** timestamp - Timestamp Unix da alteração */
    timestamp: z.number(),
  }),
)

/** IndexingStarted
 * Descrição: Evento emitido quando a indexação de um arquivo inicia.
 * Permite tracking de progresso e priorização de recursos (LlmPriorityQueue).
 */
export const IndexingStarted = defineBusEvent(
  'codebase.indexing_started',
  z.object({
    /** filePath - Caminho absoluto do arquivo sendo indexado */
    filePath: z.string(),
    /** level - Nível hierárquico do índice sendo processado */
    level: z.enum(['L0', 'L1', 'L2', 'L3', 'L4']),
  }),
)

/** IndexingCompleted
 * Descrição: Evento emitido quando a indexação de um arquivo é concluída com sucesso.
 * Contém métricas de performance e status de enriquecimento.
 */
export const IndexingCompleted = defineBusEvent(
  'codebase.indexing_completed',
  z.object({
    /** filePath - Caminho absoluto do arquivo indexado */
    filePath: z.string(),
    /** chunksIndexed - Número de chunks gerados para o arquivo */
    chunksIndexed: z.number(),
    /** durationMs - Tempo total de indexação em milissegundos */
    durationMs: z.number(),
    /** enriched - Se o arquivo passou por enriquecimento LLM */
    enriched: z.boolean(),
  }),
)

/** IndexingFailed
 * Descrição: Evento emitido quando a indexação de um arquivo falha.
 * Permite retry automático e alertas de observabilidade.
 */
export const IndexingFailed = defineBusEvent(
  'codebase.indexing_failed',
  z.object({
    /** filePath - Caminho absoluto do arquivo que falhou */
    filePath: z.string(),
    /** error - Mensagem de erro descrevendo a falha */
    error: z.string(),
    /** stage - Estágio da pipeline onde a falha ocorreu (ex: 'chunk', 'embed', 'enrich') */
    stage: z.string(),
  }),
)

// ─── MCP Events (Phase 2) ──────────────────────────────────────────

/** McpClientConnected
 * Descrição: Evento emitido quando um cliente MCP se conecta ao servidor.
 */
export const McpClientConnected = defineBusEvent(
  'mcp.client.connected',
  z.object({
    /** clientId - Identificador único do cliente MCP */
    clientId: z.string(),
    /** transport - Tipo de transporte usado (stdio ou sse) */
    transport: z.enum(['stdio', 'sse']),
  }),
)

/** McpToolCalled
 * Descrição: Evento emitido quando uma tool MCP é invocada.
 */
export const McpToolCalled = defineBusEvent(
  'mcp.tool.called',
  z.object({
    /** clientId - Identificador do cliente que invocou */
    clientId: z.string(),
    /** toolName - Nome da tool invocada */
    toolName: z.string(),
    /** durationMs - Tempo de execução em milissegundos */
    durationMs: z.number(),
    /** success - Se a tool executou com sucesso */
    success: z.boolean(),
  }),
)

/** McpClientDisconnected
 * Descrição: Evento emitido quando um cliente MCP se desconecta.
 */
export const McpClientDisconnected = defineBusEvent(
  'mcp.client.disconnected',
  z.object({
    /** clientId - Identificador do cliente desconectado */
    clientId: z.string(),
  }),
)

// ─── Workspace Events (Phase 2) ────────────────────────────────────

/** WorkspaceRegistered
 * Descrição: Evento emitido quando um workspace é registrado.
 */
export const WorkspaceRegistered = defineBusEvent(
  'workspace.registered',
  z.object({
    /** workspaceId - ID do workspace registrado */
    workspaceId: z.string(),
    /** path - Caminho absoluto do workspace */
    path: z.string(),
  }),
)

/** CrossSearchCompleted
 * Descrição: Evento emitido quando uma busca cross-workspace é concluída.
 */
export const CrossSearchCompleted = defineBusEvent(
  'workspace.cross_search.completed',
  z.object({
    /** query - Texto da busca */
    query: z.string(),
    /** workspaceCount - Número de workspaces consultados */
    workspaceCount: z.number(),
    /** totalResults - Total de resultados retornados */
    totalResults: z.number(),
    /** durationMs - Tempo total em milissegundos */
    durationMs: z.number(),
  }),
)

// ─── Remote Events (Phase 2) ───────────────────────────────────────

/** RemoteCloned
 * Descrição: Evento emitido quando um repositório remoto é clonado.
 */
export const RemoteCloned = defineBusEvent(
  'remote.cloned',
  z.object({
    /** url - URL do repositório clonado */
    url: z.string(),
    /** localPath - Caminho local do clone */
    localPath: z.string(),
    /** durationMs - Tempo de clone em milissegundos */
    durationMs: z.number(),
  }),
)

/** RemoteCleanedUp
 * Descrição: Evento emitido quando um repositório remoto é removido por cleanup.
 */
export const RemoteCleanedUp = defineBusEvent(
  'remote.cleaned_up',
  z.object({
    /** url - URL do repositório removido */
    url: z.string(),
    /** reason - Motivo da remoção */
    reason: z.string(),
  }),
)
