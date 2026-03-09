import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

interface LogEntry {
  timestamp: string
  level: LogLevel
  component: string
  message: string
  [key: string]: unknown
}

/** Resumo de uma mensagem para o log MITM. */
export interface MessageSummary {
  index: number
  role: string
  contentLength: number
  content: string
  toolCalls?: Array<{ name: string; arguments: string }>
  toolCallId?: string
}

/** Resumo de uma tool definition. */
export interface ToolSummary {
  name: string
  description: string
  parameterNames: string[]
}

/** Dados para log de request. */
export interface RequestLogData {
  requestNumber: number
  model: string
  messageCount: number
  hasTools: boolean
  toolCount: number
  toolSummaries: ToolSummary[]
  promptTokens: number
  contextWindow: number
  compressionApplied: boolean
  stream: boolean
  maxTokens: number | undefined
  messages: MessageSummary[]
}

/** Dados para log de response (non-streaming). */
export interface ResponseLogData {
  requestNumber: number
  latencyMs: number
  promptTokens: number
  completionTokens: number
  finishReason: string
  middlewaresApplied: string[]
  contextWindow: number
  messageCount: number
  content: string
  toolCalls: Array<{ name: string; arguments: string }>
}

/** Tool call capturada do streaming. */
export interface StreamToolCall {
  name: string
  arguments: string
}

/** Dados para log de streaming completo. */
export interface StreamLogData {
  requestNumber: number
  latencyMs: number
  chunkCount: number
  promptTokens: number
  completionTokens: number
  toolCallsExtracted: number
  thinkTagsStripped: boolean
  contextWindow: number
  content: string
  messageCount: number
  finishReason: string
  streamToolCalls: StreamToolCall[]
}

/** Interface do ProxyLogger. */
export interface ProxyLogger {
  debug(message: string, extra?: Record<string, unknown>): void
  info(message: string, extra?: Record<string, unknown>): void
  warn(message: string, extra?: Record<string, unknown>): void
  error(message: string, extra?: Record<string, unknown>): void
  logRequest(data: RequestLogData): void
  logResponse(data: ResponseLogData): void
  logStreamComplete(data: StreamLogData): void
}

/** Cria ProxyLogger com JSONL + texto legivel no estilo MITM. */
export function createProxyLogger(
  component: string,
  level: LogLevel = 'info',
  logDir?: string,
): ProxyLogger {
  const minLevel = LOG_LEVELS[level]
  let logFileReady: Promise<unknown> | null = null

  if (logDir) {
    logFileReady = mkdir(logDir, { recursive: true })
  }

  function shouldLog(lvl: LogLevel): boolean {
    return LOG_LEVELS[lvl] >= minLevel
  }

  function formatStderr(entry: LogEntry): string {
    const ts = entry.timestamp.slice(11, 23)
    const lvl = entry.level.toUpperCase().padEnd(5)
    const extras = Object.entries(entry)
      .filter(([k]) => !['timestamp', 'level', 'component', 'message'].includes(k))
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')
    return `[${ts}] ${lvl} [${entry.component}] ${entry.message}${extras ? ` | ${extras}` : ''}`
  }

  async function writeEntry(entry: LogEntry): Promise<void> {
    process.stderr.write(formatStderr(entry) + '\n')
    if (logDir && logFileReady) {
      await logFileReady
      const filePath = join(logDir, 'proxy.jsonl')
      await appendFile(filePath, JSON.stringify(entry) + '\n')
    }
  }

  async function writeText(text: string): Promise<void> {
    if (logDir && logFileReady) {
      await logFileReady
      const filePath = join(logDir, 'proxy.log')
      await appendFile(filePath, text)
    }
  }

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

  function logRequest(data: RequestLogData): void {
    const ctxPct = ((data.promptTokens / data.contextWindow) * 100).toFixed(1)
    log(
      'info',
      `→ #${data.requestNumber} POST /v1/chat/completions | ${data.model} | msgs=${data.messageCount} tokens=~${data.promptTokens} ctx=${ctxPct}%`,
    )
    void writeText(formatMitmRequest(data))
  }

  function logResponse(data: ResponseLogData): void {
    const total = data.promptTokens + data.completionTokens
    const ctxPct = ((total / data.contextWindow) * 100).toFixed(1)
    log(
      'info',
      `← #${data.requestNumber} 200 (${data.latencyMs}ms) | ${data.promptTokens}+${data.completionTokens}=${total} | ctx=${ctxPct}%`,
    )
    void writeText(formatMitmResponse(data))
  }

  function logStreamComplete(data: StreamLogData): void {
    const total = data.promptTokens + data.completionTokens
    const ctxPct = ((total / data.contextWindow) * 100).toFixed(1)
    log(
      'info',
      `← #${data.requestNumber} 200 STREAM (${data.latencyMs}ms) ${data.chunkCount} chunks | ${data.promptTokens}+${data.completionTokens}=${total} | ctx=${ctxPct}%`,
    )
    void writeText(formatMitmStreamResponse(data))
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

// ─── Formatadores MITM (texto legivel) ───

const SEP = '════════════════════════════════════════════════════════════'

function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

/** Indenta texto com prefixo. */
function indent(text: string, prefix: string = '  '): string {
  return text
    .split('\n')
    .map((l) => `${prefix}${l}`)
    .join('\n')
}

/** Formata request completo com todas as mensagens. */
function formatMitmRequest(data: RequestLogData): string {
  const lines: string[] = [
    SEP,
    `[${ts()}] → POST /v1/chat/completions  #${data.requestNumber}`,
    `model: ${data.model}`,
    `stream: ${data.stream} | max_tokens: ${data.maxTokens ?? 'default'}`,
    `messages: ${data.messageCount} | tools: ${data.toolCount}`,
    `est. prompt tokens: ~${data.promptTokens}`,
  ]

  if (data.compressionApplied) {
    lines.push(`compression: applied`)
  }

  if (data.toolSummaries.length > 0) {
    lines.push('')
    lines.push('─── TOOLS ───')
    for (const tool of data.toolSummaries) {
      const params = tool.parameterNames.length > 0 ? `(${tool.parameterNames.join(', ')})` : '()'
      lines.push(`  ${tool.name}${params} — ${tool.description.slice(0, 80)}`)
    }
  }

  lines.push('')
  lines.push('─── MESSAGES ───')
  lines.push('')
  for (const msg of data.messages) {
    lines.push(formatMessageBlock(msg))
    lines.push('')
  }

  return lines.join('\n') + '\n'
}

/** Formata bloco de uma mensagem com conteudo completo. */
function formatMessageBlock(msg: MessageSummary): string {
  const lines: string[] = []
  const header = msg.toolCallId
    ? `[${msg.index}] ${msg.role} (tool_call_id: ${msg.toolCallId})`
    : `[${msg.index}] ${msg.role} (${msg.contentLength} chars)`

  lines.push(header)

  if (msg.content) {
    lines.push(indent(msg.content))
  }

  if (msg.toolCalls && msg.toolCalls.length > 0) {
    for (const tc of msg.toolCalls) {
      lines.push(indent(`→ tool_call: ${tc.name}(${tc.arguments})`))
    }
  }

  return lines.join('\n')
}

/** Formata response non-streaming completa. */
function formatMitmResponse(data: ResponseLogData): string {
  const total = data.promptTokens + data.completionTokens
  const ctxPct = ((total / data.contextWindow) * 100).toFixed(1)
  const idx = data.messageCount

  const lines: string[] = [
    '',
    '─── RESPONSE ───',
    '',
    `[${ts()}] ← 200 (${data.latencyMs}ms)  #${data.requestNumber}`,
    '',
  ]

  lines.push(`[${idx}] assistant`)
  if (data.content) {
    lines.push(indent(data.content))
  }
  if (data.toolCalls.length > 0) {
    for (const tc of data.toolCalls) {
      lines.push(indent(`→ tool_call: ${tc.name}(${tc.arguments})`))
    }
  }

  lines.push('')
  lines.push(`[${idx + 1}] finish: ${data.finishReason}`)
  lines.push('')
  lines.push(`tokens: ${data.promptTokens} prompt + ${data.completionTokens} completion = ${total}`)
  lines.push(`context: ${total} / ${data.contextWindow} = ${ctxPct}% used`)

  if (data.middlewaresApplied.length > 0) {
    lines.push(`middlewares: ${data.middlewaresApplied.join(', ')}`)
  }

  lines.push(SEP)
  lines.push('')
  return lines.join('\n') + '\n'
}

/** Formata response streaming completa. */
function formatMitmStreamResponse(data: StreamLogData): string {
  const total = data.promptTokens + data.completionTokens
  const ctxPct = ((total / data.contextWindow) * 100).toFixed(1)
  const idx = data.messageCount

  const lines: string[] = [
    '',
    '─── RESPONSE (STREAMING) ───',
    '',
    `[${ts()}] ← 200 STREAM (${data.latencyMs}ms) — ${data.chunkCount} chunks  #${data.requestNumber}`,
    '',
  ]

  lines.push(`[${idx}] assistant`)
  if (data.content) {
    lines.push(indent(data.content))
  }
  if (data.streamToolCalls.length > 0) {
    for (const tc of data.streamToolCalls) {
      lines.push(indent(`→ tool_call: ${tc.name}(${tc.arguments})`))
    }
  }

  if (data.thinkTagsStripped) {
    lines.push(indent('(think tags stripped)'))
  }
  if (data.toolCallsExtracted > 0) {
    lines.push(indent(`(${data.toolCallsExtracted} tool calls extracted from content)`))
  }

  lines.push('')
  lines.push(`[${idx + 1}] finish: ${data.finishReason}`)
  lines.push('')
  lines.push(`tokens: ${data.promptTokens} prompt + ${data.completionTokens} completion = ${total}`)
  lines.push(`context: ${total} / ${data.contextWindow} = ${ctxPct}% used`)
  lines.push(SEP)
  lines.push('')
  return lines.join('\n') + '\n'
}
