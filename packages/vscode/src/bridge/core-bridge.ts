/**
 * CoreBridge — JSON-RPC client que comunica com o core via child process Bun.
 *
 * Spawna `bun serve --mode=stdio` e comunica via stdin/stdout.
 * Cada linha de stdout é um JSON-RPC response ou notification.
 */

import { spawn, type ChildProcess, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import type { JsonRpcRequest, JsonRpcNotification, JsonRpcMessage, RpcMethod } from './protocol.js'
import { isResponse, isNotification } from './protocol.js'

/** Retorna PATH expandido com diretórios comuns do bun, homebrew e usuário */
function buildEnhancedPath(): string {
  const home = homedir()
  const extra = [
    `${home}/.bun/bin`,
    `${home}/.local/bin`,
    `${home}/bin`,
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ]
  const current = process.env['PATH'] ?? ''
  const merged = [...extra, ...current.split(':').filter(Boolean)]
  // Deduplica mantendo ordem
  return [...new Set(merged)].join(':')
}

/** Detecta o path absoluto do bun tentando locais comuns */
function detectBunPath(hint: string): string {
  if (hint !== 'bun') return hint // já é um path absoluto ou customizado
  const home = homedir()
  const candidates = [`${home}/.bun/bin/bun`, '/opt/homebrew/bin/bun', '/usr/local/bin/bun']
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  // Tenta which como fallback
  try {
    return execFileSync('/usr/bin/which', ['bun'], { encoding: 'utf-8' }).trim()
  } catch {
    return hint
  }
}

interface PendingRequest {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

type EventHandler = (...args: unknown[]) => void

export class CoreBridge {
  private childProcess: ChildProcess | null = null
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private buffer = ''
  private _ready = false
  private bunPath: string
  private cliPath: string | undefined
  private listeners = new Map<string, EventHandler[]>()

  constructor(options: {
    bunPath?: string | undefined
    /** Absolute path to CLI dist/index.js. If omitted, uses global `athion` binary. */
    cliPath?: string | undefined
  }) {
    this.bunPath = options.bunPath ?? 'bun'
    this.cliPath = options.cliPath
  }

  get ready(): boolean {
    return this._ready
  }

  // ─── Simple Event Emitter ─────────────────────────────────────

  on(event: string, handler: EventHandler): void {
    const list = this.listeners.get(event) ?? []
    list.push(handler)
    this.listeners.set(event, list)
  }

  off(event: string, handler: EventHandler): void {
    const list = this.listeners.get(event) ?? []
    this.listeners.set(
      event,
      list.filter((h) => h !== handler),
    )
  }

  private emit(event: string, ...args: unknown[]): void {
    const list = this.listeners.get(event)
    if (list) {
      for (const handler of list) {
        handler(...args)
      }
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.childProcess) return

    const enhancedEnv = { ...process.env, NO_COLOR: '1', PATH: buildEnhancedPath() }

    // If cliPath is provided, spawn via bun. Otherwise use global `athion` binary.
    if (this.cliPath) {
      const bunBin = detectBunPath(this.bunPath)
      this.childProcess = spawn(bunBin, [this.cliPath, 'serve', '--mode=stdio'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: enhancedEnv,
        shell: false,
      })
    } else {
      this.childProcess = spawn('athion', ['serve', '--mode=stdio'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: enhancedEnv,
        shell: true,
      })
    }

    this.childProcess.stdout?.setEncoding('utf-8')
    this.childProcess.stderr?.setEncoding('utf-8')

    this.childProcess.stdout?.on('data', (chunk: string) => {
      this.handleData(chunk)
    })

    this.childProcess.stderr?.on('data', (chunk: string) => {
      this.emit('log', chunk)
    })

    this.childProcess.on('exit', (code: number | null) => {
      this._ready = false
      this.rejectAllPending(new Error(`Core process exited with code ${code}`))
      this.childProcess = null
      this.emit('exit', code)
    })

    this.childProcess.on('error', (err: Error) => {
      this._ready = false
      this.emit('error', err)
    })

    try {
      await this.request('ping', undefined, 10000)
      this._ready = true
      this.emit('ready')
    } catch {
      this.stop()
      throw new Error('Core process failed to start. Is Bun installed?')
    }
  }

  stop(): void {
    if (!this.childProcess) return

    this._ready = false
    this.rejectAllPending(new Error('CoreBridge stopped'))

    this.childProcess.kill('SIGTERM')

    const proc = this.childProcess
    const timer = setTimeout(() => {
      if (!proc.killed) {
        proc.kill('SIGKILL')
      }
    }, 3000)

    proc.on('exit', () => {
      clearTimeout(timer)
    })

    this.childProcess = null
  }

  // ─── JSON-RPC ─────────────────────────────────────────────────

  async request<T = unknown>(method: RpcMethod, params?: unknown, timeoutMs = 30000): Promise<T> {
    if (!this.childProcess?.stdin?.writable) {
      throw new Error('CoreBridge not connected')
    }

    const id = this.nextId++
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    }

    return new Promise<T>((resolvePromise, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`RPC timeout: ${method} (${timeoutMs}ms)`))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: resolvePromise as (result: unknown) => void,
        reject,
        timer,
      })

      this.send(request)
    })
  }

  notify(method: string, params?: unknown): void {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {}),
    }
    this.send(notification)
  }

  onNotification(method: string, handler: (params: unknown) => void): void {
    this.on(`notification:${method}`, handler as EventHandler)
  }

  offNotification(method: string, handler: (params: unknown) => void): void {
    this.off(`notification:${method}`, handler as EventHandler)
  }

  // ─── Private ──────────────────────────────────────────────────

  private send(msg: JsonRpcRequest | JsonRpcNotification): void {
    if (!this.childProcess?.stdin?.writable) return
    const line = JSON.stringify(msg) + '\n'
    this.childProcess.stdin.write(line)
  }

  private handleData(chunk: string): void {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const msg = JSON.parse(trimmed) as JsonRpcMessage
        this.handleMessage(msg)
      } catch {
        this.emit('log', trimmed)
      }
    }
  }

  private handleMessage(msg: JsonRpcMessage): void {
    if (isResponse(msg)) {
      const pending = this.pending.get(msg.id)
      if (!pending) return

      this.pending.delete(msg.id)
      clearTimeout(pending.timer)

      if (msg.error) {
        pending.reject(new Error(msg.error.message))
      } else {
        pending.resolve(msg.result)
      }
    } else if (isNotification(msg)) {
      this.emit(`notification:${msg.method}`, msg.params)
    }
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pending.delete(id)
    }
  }
}
