/**
 * RpcClient — Cliente JSON-RPC 2.0 stdio para testes E2E da CLI.
 * Descrição: Spawna um processo `bun serve --mode=stdio` e expõe métodos para
 * enviar requisições e receber notificações JSON-RPC.
 *
 * Cada instância gerencia um processo Bun independente.
 * Usado pelos testes E2E do servidor stdio.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'

/** ROOT
 * Descrição: Caminho raiz do monorepo, calculado a partir do diretório atual.
 */
const ROOT = join(import.meta.dirname, '../../../../../')

/** CLI_ENTRY
 * Descrição: Caminho do ponto de entrada do CLI para spawn do processo.
 */
const CLI_ENTRY = join(ROOT, 'packages/cli/src/index.ts')

/** BUN_BIN
 * Descrição: Caminho do executável Bun, detectado automaticamente ou fallback para 'bun'.
 */
const BUN_BIN = process.execPath.includes('bun') ? process.execPath : 'bun'

/** PendingRequest
 * Descrição: Representa uma requisição JSON-RPC pendente aguardando resposta.
 */
type PendingRequest = {
  /** Função para resolver a Promise com o resultado */
  resolve: (result: unknown) => void
  /** Função para rejeitar a Promise com um erro */
  reject: (error: Error) => void
  /** Timer de timeout para a requisição */
  timer: ReturnType<typeof setTimeout>
}

/** NotificationHandler
 * Descrição: Tipo de função callback para processar notificações JSON-RPC recebidas.
 */
export type NotificationHandler = (method: string, params: unknown) => void

/** RpcClient
 * Descrição: Cliente JSON-RPC 2.0 que se comunica via stdio com o processo do servidor Athion CLI.
 * Gerencia o ciclo de vida do processo filho, envio de requisições e recebimento de notificações.
 */
export class RpcClient {
  /** Processo filho do servidor stdio */
  private proc: ChildProcess
  /** Contador incremental para IDs de requisições JSON-RPC */
  private nextId = 1
  /** Mapa de requisições pendentes aguardando resposta */
  private pending = new Map<number, PendingRequest>()
  /** Lista de handlers registrados para notificações */
  private notificationHandlers: NotificationHandler[] = []
  /** Buffer de dados parciais recebidos do stdout */
  private buffer = ''

  /** constructor
   * Descrição: Inicializa o cliente, spawnando o processo do servidor stdio.
   */
  private constructor() {
    this.proc = spawn(BUN_BIN, ['run', CLI_ENTRY, 'serve', '--mode=stdio'], {
      env: { ...process.env, NO_COLOR: '1' },
      cwd: ROOT,
    })
    this.proc.stdout?.setEncoding('utf-8')
    this.proc.stdout?.on('data', (chunk: string) => this.handleData(chunk))
  }

  /** create
   * Descrição: Cria e inicializa uma instância do RpcClient, aguardando o ping de verificação.
   * @param timeoutMs - Timeout máximo em ms para a conexão inicial (padrão: 20000)
   * @returns Promise com a instância do cliente conectada e verificada
   */
  static async create(timeoutMs = 20000): Promise<RpcClient> {
    const client = new RpcClient()
    await client.request<{ pong: boolean }>('ping', undefined, timeoutMs)
    return client
  }

  /** request
   * Descrição: Envia uma requisição JSON-RPC ao servidor e aguarda a resposta.
   * @param method - Nome do método RPC a ser chamado
   * @param params - Parâmetros opcionais da requisição
   * @param timeoutMs - Timeout máximo em ms para a resposta (padrão: 10000)
   * @returns Promise com o resultado tipado da requisição
   */
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

  /** onNotification
   * Descrição: Registra um handler para receber notificações JSON-RPC do servidor.
   * @param handler - Função callback que será chamada a cada notificação recebida
   * @returns Função para remover o handler registrado
   */
  onNotification(handler: NotificationHandler): () => void {
    this.notificationHandlers.push(handler)
    return () => {
      const idx = this.notificationHandlers.indexOf(handler)
      if (idx !== -1) this.notificationHandlers.splice(idx, 1)
    }
  }

  /** stop
   * Descrição: Encerra o processo filho do servidor stdio.
   */
  stop(): void {
    this.proc.kill('SIGTERM')
  }

  /** handleData
   * Descrição: Processa chunks de dados recebidos do stdout do processo filho.
   * @param chunk - Fragmento de texto recebido
   */
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

  /** dispatch
   * Descrição: Roteia uma mensagem JSON-RPC recebida para o handler de resposta ou notificação.
   * @param msg - Mensagem JSON-RPC parseada
   */
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
