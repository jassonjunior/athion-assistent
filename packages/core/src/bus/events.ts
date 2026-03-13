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
