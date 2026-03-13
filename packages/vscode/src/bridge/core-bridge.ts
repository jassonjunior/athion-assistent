/**
 * CoreBridge
 * Descrição: Cliente JSON-RPC que comunica com o core via child process Bun.
 * Spawna `bun serve --mode=stdio` e comunica via stdin/stdout.
 * Cada linha de stdout é um JSON-RPC response ou notification.
 */

import { spawn, type ChildProcess, execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import type { JsonRpcRequest, JsonRpcNotification, JsonRpcMessage, RpcMethod } from './protocol.js'
import { isResponse, isNotification } from './protocol.js'

/**
 * buildEnhancedPath
 * Descrição: Constrói um PATH expandido com diretórios comuns do bun, homebrew e usuário.
 * @returns String com todos os diretórios de PATH concatenados e deduplicados
 */
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

/**
 * detectBunPath
 * Descrição: Detecta o caminho absoluto do executável bun tentando locais comuns no sistema.
 * @param hint - Dica de caminho (se diferente de 'bun', retorna diretamente)
 * @returns Caminho absoluto do bun encontrado ou o hint original
 */
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

/**
 * PendingRequest
 * Descrição: Representa uma requisição JSON-RPC pendente aguardando resposta.
 */
interface PendingRequest {
  /** Função para resolver a promise com o resultado */
  resolve: (result: unknown) => void
  /** Função para rejeitar a promise com erro */
  reject: (error: Error) => void
  /** Timer de timeout da requisição */
  timer: ReturnType<typeof setTimeout>
}

/**
 * EventHandler
 * Descrição: Tipo de função handler para eventos do emitter interno.
 */
type EventHandler = (...args: unknown[]) => void

/**
 * CoreBridge
 * Descrição: Ponte de comunicação JSON-RPC com o processo core via child process Bun.
 * Gerencia o ciclo de vida do processo, requisições pendentes e emissão de eventos.
 */
export class CoreBridge {
  /** Processo filho Bun que executa o core */
  private childProcess: ChildProcess | null = null
  /** Contador incremental para IDs de requisições JSON-RPC */
  private nextId = 1
  /** Mapa de requisições pendentes aguardando resposta */
  private pending = new Map<number, PendingRequest>()
  /** Buffer para dados parciais recebidos via stdout */
  private buffer = ''
  /** Flag indicando se o core está pronto para receber requisições */
  private _ready = false
  /** Caminho do executável bun */
  private bunPath: string
  /** Caminho do CLI dist/index.js, se fornecido */
  private cliPath: string | undefined
  /** Mapa de listeners de eventos internos */
  private listeners = new Map<string, EventHandler[]>()

  /**
   * constructor
   * Descrição: Inicializa o CoreBridge com as opções de caminho do bun e CLI.
   * @param options - Opções de configuração com bunPath e cliPath
   */
  constructor(options: {
    /** Caminho do executável bun (padrão: 'bun') */
    bunPath?: string | undefined
    /** Caminho absoluto do CLI dist/index.js. Se omitido, usa o binário global `athion` */
    cliPath?: string | undefined
  }) {
    this.bunPath = options.bunPath ?? 'bun'
    this.cliPath = options.cliPath
  }

  /**
   * ready
   * Descrição: Indica se o core está pronto para receber requisições.
   * @returns true se o core está conectado e respondeu ao ping inicial
   */
  get ready(): boolean {
    return this._ready
  }

  // ─── Simple Event Emitter ─────────────────────────────────────

  /**
   * on
   * Descrição: Registra um handler para um evento específico.
   * @param event - Nome do evento a escutar
   * @param handler - Função callback chamada quando o evento é emitido
   * @returns void
   */
  on(event: string, handler: EventHandler): void {
    const list = this.listeners.get(event) ?? []
    list.push(handler)
    this.listeners.set(event, list)
  }

  /**
   * off
   * Descrição: Remove um handler de um evento específico.
   * @param event - Nome do evento
   * @param handler - Referência do handler a remover
   * @returns void
   */
  off(event: string, handler: EventHandler): void {
    const list = this.listeners.get(event) ?? []
    this.listeners.set(
      event,
      list.filter((h) => h !== handler),
    )
  }

  /**
   * emit
   * Descrição: Emite um evento para todos os handlers registrados.
   * @param event - Nome do evento a emitir
   * @param args - Argumentos passados para os handlers
   * @returns void
   */
  private emit(event: string, ...args: unknown[]): void {
    const list = this.listeners.get(event)
    if (list) {
      for (const handler of list) {
        handler(...args)
      }
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────────

  /**
   * start
   * Descrição: Inicia o processo core, spawna o child process Bun e aguarda o ping inicial.
   * @returns Promise que resolve quando o core está pronto
   */
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

  /**
   * stop
   * Descrição: Para o processo core enviando SIGTERM e SIGKILL após timeout.
   * Rejeita todas as requisições pendentes.
   * @returns void
   */
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

  /**
   * request
   * Descrição: Envia uma requisição JSON-RPC ao core e aguarda a resposta.
   * @param method - Método RPC a ser chamado
   * @param params - Parâmetros da requisição (opcional)
   * @param timeoutMs - Timeout em milissegundos (padrão: 30000)
   * @returns Promise com o resultado tipado da requisição
   */
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

  /**
   * notify
   * Descrição: Envia uma notificação JSON-RPC ao core (sem esperar resposta).
   * @param method - Método RPC da notificação
   * @param params - Parâmetros da notificação (opcional)
   * @returns void
   */
  notify(method: string, params?: unknown): void {
    const notification: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {}),
    }
    this.send(notification)
  }

  /**
   * onNotification
   * Descrição: Registra handler para notificações JSON-RPC de um método específico.
   * @param method - Método da notificação a escutar
   * @param handler - Função callback chamada com os parâmetros da notificação
   * @returns void
   */
  onNotification(method: string, handler: (params: unknown) => void): void {
    this.on(`notification:${method}`, handler as EventHandler)
  }

  /**
   * offNotification
   * Descrição: Remove handler de notificações JSON-RPC de um método específico.
   * @param method - Método da notificação
   * @param handler - Referência do handler a remover
   * @returns void
   */
  offNotification(method: string, handler: (params: unknown) => void): void {
    this.off(`notification:${method}`, handler as EventHandler)
  }

  // ─── Private ──────────────────────────────────────────────────

  /**
   * send
   * Descrição: Serializa e envia uma mensagem JSON-RPC via stdin do child process.
   * @param msg - Mensagem JSON-RPC (request ou notification) a enviar
   * @returns void
   */
  private send(msg: JsonRpcRequest | JsonRpcNotification): void {
    if (!this.childProcess?.stdin?.writable) return
    const line = JSON.stringify(msg) + '\n'
    this.childProcess.stdin.write(line)
  }

  /**
   * handleData
   * Descrição: Processa dados brutos recebidos via stdout, acumulando no buffer e parseando linhas completas.
   * @param chunk - Fragmento de dados recebido do stdout
   * @returns void
   */
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

  /**
   * handleMessage
   * Descrição: Processa uma mensagem JSON-RPC parseada, resolvendo requisições pendentes ou emitindo notificações.
   * @param msg - Mensagem JSON-RPC já parseada
   * @returns void
   */
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

  /**
   * rejectAllPending
   * Descrição: Rejeita todas as requisições pendentes com o erro fornecido.
   * @param error - Erro a ser passado para as promises pendentes
   * @returns void
   */
  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(error)
      this.pending.delete(id)
    }
  }
}
