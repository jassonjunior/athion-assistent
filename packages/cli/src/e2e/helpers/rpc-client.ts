/**
 * RpcClient — cliente JSON-RPC 2.0 stdio para testes E2E da CLI.
 *
 * Spawna `bun serve --mode=stdio` e expõe request() + onNotification().
 * Cada instância gerencia um processo Bun independente.
 * Usado pelos testes E2E do servidor stdio.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '../../../../../')
const CLI_ENTRY = join(ROOT, 'packages/cli/src/index.ts')
const BUN_BIN = process.execPath.includes('bun') ? process.execPath : 'bun'

type PendingRequest = {
  resolve: (result: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export type NotificationHandler = (method: string, params: unknown) => void

export class RpcClient {
  private proc: ChildProcess
  private nextId = 1
  private pending = new Map<number, PendingRequest>()
  private notificationHandlers: NotificationHandler[] = []
  private buffer = ''

  private constructor() {
    this.proc = spawn(BUN_BIN, ['run', CLI_ENTRY, 'serve', '--mode=stdio'], {
      env: { ...process.env, NO_COLOR: '1' },
      cwd: ROOT,
    })
    this.proc.stdout?.setEncoding('utf-8')
    this.proc.stdout?.on('data', (chunk: string) => this.handleData(chunk))
  }

  static async create(timeoutMs = 20000): Promise<RpcClient> {
    const client = new RpcClient()
    await client.request<{ pong: boolean }>('ping', undefined, timeoutMs)
    return client
  }

  async request<T = unknown>(method: string, params?: unknown, timeoutMs = 10000): Promise<T> {
    const id = this.nextId++
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    })

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`RPC timeout (${timeoutMs}ms): ${method}`))
      }, timeoutMs)

      this.pending.set(id, { resolve: resolve as (r: unknown) => void, reject, timer })
      this.proc.stdin?.write(payload + '\n')
    })
  }

  onNotification(handler: NotificationHandler): () => void {
    this.notificationHandlers.push(handler)
    return () => {
      const idx = this.notificationHandlers.indexOf(handler)
      if (idx !== -1) this.notificationHandlers.splice(idx, 1)
    }
  }

  stop(): void {
    this.proc.kill('SIGTERM')
  }

  private handleData(chunk: string): void {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        this.dispatch(JSON.parse(trimmed) as Record<string, unknown>)
      } catch {
        /* ignora saída não-JSON (logs do stderr etc.) */
      }
    }
  }

  private dispatch(msg: Record<string, unknown>): void {
    if ('id' in msg && msg['id'] !== null && msg['id'] !== undefined) {
      const pending = this.pending.get(msg['id'] as number)
      if (!pending) return
      this.pending.delete(msg['id'] as number)
      clearTimeout(pending.timer)
      if (msg['error']) {
        const err = msg['error'] as { message: string }
        pending.reject(new Error(err.message))
      } else {
        pending.resolve(msg['result'])
      }
    } else if ('method' in msg) {
      for (const h of this.notificationHandlers) h(msg['method'] as string, msg['params'])
    }
  }
}
