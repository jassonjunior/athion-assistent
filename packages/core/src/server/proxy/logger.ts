import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

/** Niveis de log suportados.
 * @typedef {Object} LogLevel
 * @property {string} debug - Debug.
 * @property {string} info - Info.
 * @property {string} warn - Warn.
 * @property {string} error - Error.
 * @example
 * const logLevel: LogLevel = 'debug'
 */
type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

/** Entrada de log estruturada.
 * @typedef {Object} LogEntry
 * @property {string} timestamp - Timestamp da entrada.
 * @property {LogLevel} level - Nivel da entrada.
 * @property {string} component - Componente da entrada.
 * @property {string} message - Mensagem da entrada.
 * @property {Record<string, unknown>} [extra] - Extra da entrada.
 */
interface LogEntry {
  timestamp: string
  level: LogLevel
  component: string
  message: string
  [key: string]: unknown
}

/** Interface do ProxyLogger.
 * @typedef {Object} ProxyLogger
 * @property {function} debug - Loga evento de debug.
 * @property {function} info - Loga evento de info.
 * @property {function} warn - Loga evento de warn.
 * @property {function} error - Loga evento de error.
 * @property {function} logRequest - Loga evento de request.
 * @property {function} logResponse - Loga evento de response.
 * @property {function} logStreamComplete - Loga evento de streaming completo.
 */
export interface ProxyLogger {
  debug(message: string, extra?: Record<string, unknown>): void
  info(message: string, extra?: Record<string, unknown>): void
  warn(message: string, extra?: Record<string, unknown>): void
  error(message: string, extra?: Record<string, unknown>): void
  /** Loga evento de request recebido */
  logRequest(data: RequestLogData): void
  /** Loga evento de response completo */
  logResponse(data: ResponseLogData): void
  /** Loga evento de streaming completo */
  logStreamComplete(data: StreamLogData): void
}

/** Dados para log de request.
 * @typedef {Object} RequestLogData
 * @property {string} model - Modelo do request.
 * @property {number} messageCount - Quantidade de mensagens do request.
 * @property {boolean} hasTools - Se o request tem tools.
 * @property {number} promptTokens - Quantidade de tokens da prompt.
 * @property {number} contextWindow - Limite de contexto do request.
 * @property {boolean} compressionApplied - Se a compressao foi aplicada.
 * @property {boolean} safetyBlocked - Se o safety guard foi bloqueado.
 */
export interface RequestLogData {
  model: string
  messageCount: number
  hasTools: boolean
  promptTokens: number
  contextWindow: number
  compressionApplied: boolean
  safetyBlocked: boolean
}

/** Dados para log de response.
 * @typedef {Object} ResponseLogData
 * @property {number} latencyMs - Latencia do response.
 * @property {number} promptTokens - Quantidade de tokens da prompt.
 * @property {number} completionTokens - Quantidade de tokens da completion.
 * @property {string[]} toolCalls - Tool calls do response.
 * @property {string} finishReason - Razao da finalizacao do response.
 * @property {string[]} middlewaresApplied - Middlewares aplicados no response.
 * @property {number} contextWindow - Limite de contexto do response.
 */
export interface ResponseLogData {
  latencyMs: number
  promptTokens: number
  completionTokens: number
  toolCalls: string[]
  finishReason: string
  middlewaresApplied: string[]
  contextWindow: number
}

/** Dados para log de streaming completo.
 * @typedef {Object} StreamLogData
 * @property {number} latencyMs - Latencia do streaming completo.
 * @property {number} chunkCount - Quantidade de chunks do streaming completo.
 * @property {number} promptTokens - Quantidade de tokens da prompt.
 * @property {number} completionTokens - Quantidade de tokens da completion.
 * @property {number} contextWindow - Limite de contexto do streaming completo.
 */
export interface StreamLogData {
  latencyMs: number
  chunkCount: number
  promptTokens: number
  completionTokens: number
  toolCallsExtracted: number
  thinkTagsStripped: boolean
  contextWindow: number
}

/**
 * Cria um ProxyLogger com output JSONL em arquivo e stderr formatado.
 * @param component - Nome do componente (ex: 'proxy', 'streaming')
 * @param level - Nivel minimo de log
 * @param logDir - Diretorio para arquivo JSONL (opcional)
 * @returns ProxyLogger
 */
export function createProxyLogger(
  component: string,
  level: LogLevel = 'info',
  logDir?: string,
): ProxyLogger {
  const minLevel = LOG_LEVELS[level]
  let logFileReady: Promise<void> | null = null

  if (logDir) {
    logFileReady = mkdir(logDir, { recursive: true })
  }

  /** Verifica se o nivel de log eh suficiente para ser logado.
   * @param {LogLevel} lvl - Nivel de log.
   * @returns {boolean} Se o nivel de log eh suficiente para ser logado.
   * @example
   * const shouldLog = shouldLog('debug')
   * console.log(shouldLog) // true
   */
  function shouldLog(lvl: LogLevel): boolean {
    return LOG_LEVELS[lvl] >= minLevel
  }

  /** Formata a entrada para o formato de stderr.
   * @param {LogEntry} entry - Entrada de log.
   * @returns {string} Entrada formatada para stderr.
   * @example
   * const formatted = formatStderr({ timestamp: '2026-03-08T12:00:00.000Z', level: 'debug', component: 'proxy', message: 'Request received' })
   * console.log(formatted) // [12:00:00] DEBUG [proxy] Request received
   */
  function formatStderr(entry: LogEntry): string {
    const ts = entry.timestamp.slice(11, 23)
    const lvl = entry.level.toUpperCase().padEnd(5)
    const extras = Object.entries(entry)
      .filter(([k]) => !['timestamp', 'level', 'component', 'message'].includes(k))
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')
    return `[${ts}] ${lvl} [${entry.component}] ${entry.message}${extras ? ` | ${extras}` : ''}`
  }

  /** Escreve a entrada no arquivo JSONL e no stderr.
   * @param {LogEntry} entry - Entrada de log.
   * @returns {Promise<void>} Promise que resolve quando a entrada for escrita.
   * @example
   * const entry: LogEntry = { timestamp: '2026-03-08T12:00:00.000Z', level: 'debug', component: 'proxy', message: 'Request received' }
   * await writeEntry(entry)
   */
  async function writeEntry(entry: LogEntry): Promise<void> {
    process.stderr.write(formatStderr(entry) + '\n')
    if (logDir && logFileReady) {
      await logFileReady
      const filePath = join(logDir, 'proxy.jsonl')
      await appendFile(filePath, JSON.stringify(entry) + '\n')
    }
  }

  /** Loga a entrada.
   * @param {LogLevel} lvl - Nivel de log.
   * @param {string} message - Mensagem de log.
   * @param {Record<string, unknown>} [extra] - Extra de log.
   * @example
   * log('debug', 'Request received', { direction: 'request' })
   */
  function log(lvl: LogLevel, message: string, extra?: Record<string, unknown>): void {
    if (!shouldLog(lvl)) return
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: lvl,
      component,
      message,
      ...extra,
    }
    void writeEntry(entry)
  }

  /** Loga evento de request.
   * @param {RequestLogData} data - Dados do request.
   * @example
   * const data: RequestLogData = { model: 'gpt-4o', messageCount: 1, promptTokens: 100, contextWindow: 1000, compressionApplied: true, safetyBlocked: false }
   * logRequest(data)
   */
  function logRequest(data: RequestLogData): void {
    const ctxPct = ((data.promptTokens / data.contextWindow) * 100).toFixed(1)
    log(
      'info',
      `request: ${data.model} msgs=${data.messageCount} tokens=${data.promptTokens} ctx=${ctxPct}%`,
      {
        direction: 'request',
        ...data,
      },
    )
  }

  /** Loga evento de response.
   * @param {ResponseLogData} data - Dados do response.
   * @example
   * const data: ResponseLogData = { latencyMs: 100, promptTokens: 100, completionTokens: 200, toolCalls: ['tool1', 'tool2'], finishReason: 'stop', middlewaresApplied: ['middleware1', 'middleware2'], contextWindow: 1000 }
   * logResponse(data)
   */
  function logResponse(data: ResponseLogData): void {
    const total = data.promptTokens + data.completionTokens
    const ctxPct = ((total / data.contextWindow) * 100).toFixed(1)
    log(
      'info',
      `tokens: ${data.promptTokens} prompt + ${data.completionTokens} completion = ${total} | ctx=${ctxPct}% | ${data.latencyMs}ms`,
      {
        direction: 'response',
        ...data,
      },
    )
  }

  /** Loga evento de streaming completo.
   * @param {StreamLogData} data - Dados do streaming completo.
   * @example
   * const data: StreamLogData = { latencyMs: 100, chunkCount: 100, promptTokens: 100, completionTokens: 200, contextWindow: 1000 }
   * logStreamComplete(data)
   */
  function logStreamComplete(data: StreamLogData): void {
    const total = data.promptTokens + data.completionTokens
    const ctxPct = ((total / data.contextWindow) * 100).toFixed(1)
    log(
      'info',
      `stream: ${data.chunkCount} chunks | ${data.promptTokens}+${data.completionTokens}=${total} tokens | ctx=${ctxPct}% | ${data.latencyMs}ms`,
      {
        direction: 'stream_complete',
        ...data,
      },
    )
  }

  return {
    debug: (msg, extra) => log('debug', msg, extra),
    info: (msg, extra) => log('info', msg, extra),
    warn: (msg, extra) => log('warn', msg, extra),
    error: (msg, extra) => log('error', msg, extra),
    logRequest,
    logResponse,
    logStreamComplete,
  }
}
