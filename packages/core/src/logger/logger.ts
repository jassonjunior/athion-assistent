/**
 * Structured logger para o Athion.
 * Interface compatível com Pino — pode ser substituído por `pino` sem mudanças nos call-sites.
 * Emite JSON para stdout quando LOG_FORMAT=json, texto legível caso contrário.
 * Sempre grava em arquivo ~/.athion/athion.log (acessível via tail -f de outro terminal).
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent'

const LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: Infinity,
}

export interface LogEntry {
  level: number
  time: number
  msg: string
  name?: string
  [key: string]: unknown
}

export interface Logger {
  trace(obj: object, msg?: string): void
  trace(msg: string): void
  debug(obj: object, msg?: string): void
  debug(msg: string): void
  info(obj: object, msg?: string): void
  info(msg: string): void
  warn(obj: object, msg?: string): void
  warn(msg: string): void
  error(obj: object, msg?: string): void
  error(msg: string): void
  fatal(obj: object, msg?: string): void
  fatal(msg: string): void
  /** Cria um child logger com bindings extras (ex: { module: 'orchestrator' }) */
  child(bindings: Record<string, unknown>): Logger
  /** Altera o nível mínimo de log em runtime */
  setLevel(level: LogLevel): void
}

const LEVEL_LABELS: Record<number, string> = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO ',
  40: 'WARN ',
  50: 'ERROR',
  60: 'FATAL',
}

function resolveEnvLevel(): LogLevel {
  const env = process.env['LOG_LEVEL'] ?? process.env['ATHION_LOG_LEVEL']
  if (env && env in LEVELS) return env as LogLevel
  return process.env['NODE_ENV'] === 'test' ? 'silent' : 'info'
}

const isJson = process.env['LOG_FORMAT'] === 'json'

/** Caminho do arquivo de log persistente */
const LOG_DIR = join(homedir(), '.athion')
const LOG_FILE = join(LOG_DIR, 'athion.log')

// Garante que o diretório existe (sync, executa uma vez no import)
try {
  mkdirSync(LOG_DIR, { recursive: true })
} catch {
  // ignora se já existe ou sem permissão
}

function writeToFile(line: string): void {
  try {
    appendFileSync(LOG_FILE, line + '\n')
  } catch {
    // ignora erros de escrita — não deve quebrar o app
  }
}

/** Cria uma instância do Logger estruturado. */
export function createLogger(name?: string, bindings: Record<string, unknown> = {}): Logger {
  let minLevel = LEVELS[resolveEnvLevel()]

  function write(levelNum: number, objOrMsg: object | string, msg?: string): void {
    if (levelNum < minLevel) return

    const now = Date.now()
    const message = typeof objOrMsg === 'string' ? objOrMsg : (msg ?? '')
    const extra = typeof objOrMsg === 'object' ? objOrMsg : {}

    const label = LEVEL_LABELS[levelNum] ?? '?????'
    const ts = new Date(now).toISOString()
    const prefix = name ? `[${name}] ` : ''
    const extras = Object.keys({ ...bindings, ...extra }).length
      ? ' ' + JSON.stringify({ ...bindings, ...extra })
      : ''
    const textLine = `${ts} ${label} ${prefix}${message}${extras}`

    // Sempre grava no arquivo de log
    writeToFile(textLine)

    if (isJson) {
      const entry: LogEntry = {
        level: levelNum,
        time: now,
        msg: message,
        ...(name ? { name } : {}),
        ...bindings,
        ...extra,
      }
      process.stdout.write(JSON.stringify(entry) + '\n')
    } else {
      process.stderr.write(textLine + '\n')
    }
  }

  function setLevel(level: LogLevel): void {
    minLevel = LEVELS[level]
  }

  function child(childBindings: Record<string, unknown>): Logger {
    return createLogger(name, { ...bindings, ...childBindings })
  }

  return {
    trace: (o: object | string, m?: string) => write(10, o, m),
    debug: (o: object | string, m?: string) => write(20, o, m),
    info: (o: object | string, m?: string) => write(30, o, m),
    warn: (o: object | string, m?: string) => write(40, o, m),
    error: (o: object | string, m?: string) => write(50, o, m),
    fatal: (o: object | string, m?: string) => write(60, o, m),
    child,
    setLevel,
  }
}

/** Logger raiz singleton. */
export const logger = createLogger('athion')
