import { z } from 'zod/v4'

/**
 * Schema de configuracao do proxy.
 * parametros:
 * - proxyPort: Porta do proxy.
 * - backendHost: Host do backend.
 * - backendPort: Porta do backend.
 * - contextWindow: Limite de contexto.
 * - maxOutputTokens: Limite de tokens de saida.
 * - compressionEnabled: Habilitar compressao.
 * - compressionTriggerThreshold: Limite de trigger para compressao.
 * - compressionPreserveFraction: Fração de tokens a preservar.
 * - safetyGuardEnabled: Habilitar safety guard.
 * - thinkStripperEnabled: Habilitar think stripper.
 * - toolSanitizerEnabled: Habilitar tool sanitizer.
 * - modelTtlMinutes: Tempo de TTL do modelo.
 * - logLevel: Nivel de log.
 * @example
 * const config = ProxyConfigSchema.parse({
 *   proxyPort: 1236,
 *   backendHost: '127.0.0.1',
 *   backendPort: 8000,
 *   contextWindow: 85000,
 *   maxOutputTokens: 8192,
 * })
 * @returns {z.infer<typeof ProxyConfigSchema>} Configuracao do proxy.
 */
export const ProxyConfigSchema = z.object({
  proxyPort: z.number().default(1236),
  backendHost: z.string().default('127.0.0.1'),
  backendPort: z.number().default(8000),
  contextWindow: z.number().default(85000),
  maxOutputTokens: z.number().default(8192),
  compressionEnabled: z.boolean().default(true),
  compressionTriggerThreshold: z.number().default(0.9),
  compressionPreserveFraction: z.number().default(0.3),
  safetyGuardEnabled: z.boolean().default(true),
  thinkStripperEnabled: z.boolean().default(true),
  toolSanitizerEnabled: z.boolean().default(true),
  modelTtlMinutes: z.number().default(30),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
})

/** Configuracao do proxy.
 * @typedef {z.infer<typeof ProxyConfigSchema>} ProxyConfig
 * @example
 * const config: ProxyConfig = {
 *   proxyPort: 1236,
 *   backendHost: '127.0.0.1',
 *   backendPort: 8000,
 *   contextWindow: 85000,
 *   maxOutputTokens: 8192,
 *   compressionEnabled: true,
 *   compressionTriggerThreshold: 0.9,
 *   compressionPreserveFraction: 0.3,
 *   safetyGuardEnabled: true,
 *   thinkStripperEnabled: true,
 *   toolSanitizerEnabled: true,
 *   modelTtlMinutes: 30,
 *   logLevel: 'info',
 * }
 */
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>

/** URL base do backend calculada a partir da config.
 * @param {ProxyConfig} config - Configuracao do proxy.
 * @returns {string} URL base do backend.
 * @example
 * const url = backendUrl(config)
 * console.log(url) // http://127.0.0.1:8000
 */
export function backendUrl(config: ProxyConfig): string {
  return `http://${config.backendHost}:${config.backendPort}`
}
/** Limite efetivo de contexto (descontando max output).
 * @param {ProxyConfig} config - Configuracao do proxy.
 * @returns {number} Limite efetivo de contexto.
 * @example
 * const limit = effectiveContextLimit(config)
 * console.log(limit) // 85000
 */
export function effectiveContextLimit(config: ProxyConfig): number {
  return Math.max(
    config.contextWindow - config.maxOutputTokens,
    Math.floor(config.contextWindow * 0.5),
  )
}

// ─── Tipos OpenAI-compatible ───

/** Mensagem no formato OpenAI.
 * @typedef {Object} OpenAIMessage
 * @property {string} role - Role da mensagem.
 * @property {string | null} content - Conteudo da mensagem.
 * @property {OpenAIToolCall[]} tool_calls - Tool calls da mensagem.
 * @property {string} tool_call_id - ID do tool call.
 * @property {string} name - Nome do tool.
 * @example
 * const message: OpenAIMessage = {
 *   role: 'user',
 *   content: 'Hello, how are you?',
 *   tool_calls: [],
 *   tool_call_id: '123',
 *   name: 'tool',
 * }
 */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: OpenAIToolCall[]
  tool_call_id?: string
  name?: string
}

/** Tool call no formato OpenAI.
 * @typedef {Object} OpenAIToolCall
 * @property {string} id - ID do tool call.
 * @property {string} type - Tipo do tool call.
 * @property {Object} function - Funcao do tool call.
 * @example
 * const toolCall: OpenAIToolCall = {
 *   id: '123',
 *   type: 'function',
 *   function: { name: 'tool', arguments: '{"arg1": "value1", "arg2": "value2"}' },
 * }
 */
export interface OpenAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** Definicao de tool no formato OpenAI.
 * @typedef {Object} OpenAIToolDef
 * @property {string} type - Tipo do tool.
 * @property {Object} function - Funcao do tool.
 * @example
 * const toolDef: OpenAIToolDef = {
 *   type: 'function',
 *   function: { name: 'tool', description: 'Tool description', parameters: { type: 'object', properties: { arg1: { type: 'string' }, arg2: { type: 'string' } } } },
 * }
 */
export interface OpenAIToolDef {
  type: 'function'
  function: { name: string; description: string; parameters: unknown }
}

/** Request de chat completions.
 * @typedef {Object} OpenAIChatRequest
 * @property {string} model - Modelo do chat.
 * @property {OpenAIMessage[]} messages - Mensagens do chat.
 * @property {boolean} stream - Flag para streaming.
 * @property {OpenAIToolDef[]} tools - Tools do chat.
 * @property {number} temperature - Temperatura do chat.
 * @property {number} max_tokens - Limite de tokens da resposta.
 * @property {Object} stream_options - Opcoes de streaming.
 * @property {Record<string, unknown>} metadata - Metadados do chat.
 * @example
 * const chatRequest: OpenAIChatRequest = {
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello, how are you?' }],
 *   stream: true,
 *   tools: [{ type: 'function', function: { name: 'tool', description: 'Tool description', parameters: { type: 'object', properties: { arg1: { type: 'string' }, arg2: { type: 'string' } } } } }],
 *   temperature: 0.7,
 * }
 */
export interface OpenAIChatRequest {
  model: string
  messages: OpenAIMessage[]
  stream?: boolean
  tools?: OpenAIToolDef[]
  temperature?: number
  max_tokens?: number
  stream_options?: { include_usage?: boolean }
  metadata?: Record<string, unknown>
}

/** Usage de tokens.
 * @typedef {Object} OpenAIUsage
 * @property {number} prompt_tokens - Tokens da prompt.
 * @property {number} completion_tokens - Tokens da resposta.
 * @property {number} total_tokens - Total de tokens.
 * @example
 * const usage: OpenAIUsage = {
 *   prompt_tokens: 100,
 *   completion_tokens: 200,
 *   total_tokens: 300,
 * }
 */
export interface OpenAIUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

/** Choice na resposta.
 * @typedef {Object} OpenAIChoice
 * @property {number} index - Index da choice.
 * @property {OpenAIMessage} message - Mensagem da choice.
 * @property {string | null} finish_reason - Razao da finalizacao.
 * @example
 * const choice: OpenAIChoice = {
 *   index: 0,
 *   message: { role: 'assistant', content: 'Hello, how are you?' },
 *   finish_reason: 'stop',
 * }
 */
export interface OpenAIChoice {
  index: number
  message: OpenAIMessage
  finish_reason: string | null
}

/** Resposta completa (non-streaming).
 * @typedef {Object} OpenAIChatResponse
 * @property {string} id - ID da resposta.
 * @property {string} object - Objeto da resposta.
 * @property {number} created - Timestamp da criacao.
 * @property {string} model - Modelo da resposta.
 * @property {OpenAIChoice[]} choices - Choices da resposta.
 * @property {OpenAIUsage} usage - Usage da resposta.
 * @example
 * const response: OpenAIChatResponse = {
 *   id: '123',
 *   object: 'chat.completion',
 *   created: 1715395200,
 *   model: 'gpt-4o',
 *   choices: [{ index: 0, message: { role: 'assistant', content: 'Hello, how are you?' }, finish_reason: 'stop' }],
 *   usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
 * }
 */
export interface OpenAIChatResponse {
  id: string
  object: string
  created: number
  model: string
  choices: OpenAIChoice[]
  usage: OpenAIUsage
}

/** Delta no streaming.
 * @typedef {Object} OpenAIDelta
 * @property {string | undefined} role - Role do delta.
 * @property {string | null} content - Conteudo do delta.
 * @property {Array<{ index: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }>} tool_calls - Tool calls do delta.
 * @example
 * const delta: OpenAIDelta = {
 *   role: 'assistant',
 *   content: 'Hello, how are you?',
 *   tool_calls: [{ index: 0, id: '123', type: 'function', function: { name: 'tool', arguments: '{"arg1": "value1", "arg2": "value2"}' } }],
 * }
 */
export interface OpenAIDelta {
  role?: string
  content?: string | null
  tool_calls?: Array<{
    index: number
    id?: string
    type?: string
    function?: { name?: string; arguments?: string }
  }>
}

/** Choice no streaming.
 * @typedef {Object} OpenAIStreamChoice
 * @property {number} index - Index da choice.
 * @property {OpenAIDelta} delta - Delta da choice.
 * @property {string | null} finish_reason - Razao da finalizacao.
 * @example
 * const choice: OpenAIStreamChoice = {
 *   index: 0,
 *   delta: { role: 'assistant', content: 'Hello, how are you?' },
 *   finish_reason: 'stop',
 * }
 */
export interface OpenAIStreamChoice {
  index: number
  delta: OpenAIDelta
  finish_reason: string | null
}

/** Chunk SSE do streaming.
 * @typedef {Object} OpenAIStreamChunk
 * @property {string} id - ID do chunk.
 * @property {string} object - Objeto do chunk.
 * @property {number} created - Timestamp da criacao.
 * @property {string} model - Modelo do chunk.
 * @property {OpenAIStreamChoice[]} choices - Choices do chunk.
 * @property {OpenAIUsage | null} usage - Usage do chunk.
 * @example
 * const chunk: OpenAIStreamChunk = {
 *   id: '123',
 *   object: 'chat.completion.chunk',
 *   created: 1715395200,
 *   model: 'gpt-4o',
 *   choices: [{ index: 0, delta: { role: 'assistant', content: 'Hello, how are you?' }, finish_reason: 'stop' }],
 *   usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
 * }
 */
export interface OpenAIStreamChunk {
  id: string
  object: string
  created: number
  model: string
  choices: OpenAIStreamChoice[]
  usage?: OpenAIUsage | null
}

// ─── Tipos de Middleware ───

/** Resultado de middleware que pode bloquear */
export type MiddlewareResult =
  | { blocked: false; data: OpenAIChatResponse }
  | { blocked: true; response: OpenAIChatResponse }

/** Resultado de compressao */
export interface CompressResult {
  compressed: boolean
  messages: OpenAIMessage[]
  originalTokens: number
  newTokens: number
  error?: string
}
