import { appendFile } from 'node:fs/promises'
import type { Subprocess } from 'bun'
import type { VllmManager } from './vllm-manager'

const MLX_LOG_PATH = '/tmp/mlx-omni.log'

/** Formata timestamp no padrão [YYYY-MM-DD HH:MM:SS] */
function ts(): string {
  return `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}]`
}

/** Escreve uma linha no log com timestamp, sem bloquear. */
function logLine(line: string): void {
  appendFile(MLX_LOG_PATH, `${ts()} ${line}\n`).catch(() => {})
}

/**
 * Lê um stream de saída do processo e redireciona cada linha para o log com timestamp.
 * Não bloqueia — roda em background até o stream fechar.
 */
async function pipeToLog(stream: ReadableStream<Uint8Array> | null): Promise<void> {
  if (!stream) return
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (line.trim()) logLine(line)
      }
    }
    if (buf.trim()) logLine(buf)
  } catch {
    // processo encerrou
  }
}

/** Configuracao do MLX Omni Server.
 * @typedef {Object} MlxOmniConfig
 * @property {number} port - Porta do servidor (default: 10240)
 * @property {string} host - Host do servidor (default: localhost)
 * @property {boolean} autoStart - Iniciar automaticamente se nao estiver rodando
 * @property {number} ttlMinutes - TTL em minutos (ignorado — MLX Omni gerencia por conta propria)
 * @property {number} startupTimeout - Timeout em ms para aguardar o servidor iniciar (default: 30000)
 */
export interface MlxOmniConfig {
  port: number
  host: string
  autoStart: boolean
  /** TTL em minutos — reservado para compatibilidade com VllmManager (mlx-omni gerencia internamente) */
  ttlMinutes: number
  startupTimeout: number
}

const DEFAULT_CONFIG: MlxOmniConfig = {
  port: 10240,
  host: 'localhost',
  autoStart: true,
  ttlMinutes: 30,
  startupTimeout: 30_000,
}

/** Cria um MlxOmniManager que gerencia o ciclo de vida do MLX Omni Server.
 *
 * Diferente do vllm-mlx, o MLX Omni Server:
 * - Carrega modelos sob demanda (lazy loading) via LRU+TTL cache interno
 * - swapModel() é leve: apenas atualiza currentModel e faz pre-warm do modelo
 * - Não requer restart do processo para trocar modelos
 *
 * @param overrides - Configuracoes parciais para sobrescrever os defaults
 * @returns VllmManager (interface compartilhada)
 */
export function createMlxOmniManager(overrides?: Partial<MlxOmniConfig>): VllmManager {
  const config: MlxOmniConfig = { ...DEFAULT_CONFIG, ...overrides }
  const baseUrl = `http://${config.host}:${config.port}/v1`
  let serverProcess: Subprocess | null = null
  let activeModel = ''

  return {
    isRunning,
    ensureRunning,
    stop,
    swapModel,
    touch,
    get baseUrl() {
      return baseUrl
    },
    get currentModel() {
      return activeModel
    },
  }

  async function isRunning(): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(1_000) })
      return res.ok
    } catch {
      return false
    }
  }

  async function ensureRunning(): Promise<void> {
    // Sempre verifica se está no ar primeiro
    if (await isRunning()) return

    // Se não está no ar e autoStart está desligado, apenas retorna
    // (usuário gerencia o processo manualmente)
    if (!config.autoStart) return

    // Não está no ar + autoStart habilitado → sobe o processo
    logLine(`=== mlx-omni-server starting on port ${config.port} ===`)
    serverProcess = Bun.spawn(
      ['mlx-omni-server', '--port', String(config.port), '--host', config.host],
      {
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )
    // Redireciona stdout e stderr para o log com timestamps (não bloqueia)
    pipeToLog(serverProcess.stdout as ReadableStream<Uint8Array> | null).catch(() => {})
    pipeToLog(serverProcess.stderr as ReadableStream<Uint8Array> | null).catch(() => {})
    await waitForReady(baseUrl, config.startupTimeout)
  }

  function stop(): void {
    if (serverProcess) {
      serverProcess.kill()
      serverProcess = null
    }
  }

  /** Troca o modelo ativo garantindo que o modelo anterior é completamente
   * descarregado da memória antes de carregar o novo.
   *
   * Estratégia: kill + restart do processo mlx-omni-server.
   * Isso garante que o Metal/MLX memory é 100% liberado antes do novo modelo
   * começar a carregar, evitando picos de memória com dois modelos simultâneos.
   */
  async function swapModel(model: string): Promise<void> {
    const previousModel = activeModel
    logLine(`=== swapping model: ${previousModel || 'none'} → ${model} ===`)

    // Só mata o servidor se havia um modelo anterior carregado.
    // Na primeira chamada (previousModel = ''), o servidor ainda não tem modelo
    // na memória — matar e reiniciar seria desperdício e causaria pressão de memória.
    if (previousModel) {
      if (serverProcess) {
        // SIGKILL garante liberação imediata (sem graceful shutdown)
        serverProcess.kill('SIGKILL')
        await serverProcess.exited
        serverProcess = null
      } else {
        // Processo iniciado externamente — mata pelo PID na porta
        const killer = Bun.spawn([
          'sh',
          '-c',
          `lsof -ti :${config.port} | xargs kill -9 2>/dev/null || true`,
        ])
        await killer.exited
      }
      // Aguarda o OS reclamar a memória antes de subir o novo modelo
      await Bun.sleep(3_000)
    }

    activeModel = model

    // Garante que o servidor está no ar (sobe se necessário)
    await ensureRunning()

    // Pre-warm: força carregamento do modelo antes do stream real
    logLine(`=== pre-warming model: ${model} ===`)
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: ' ' }],
          max_tokens: 5,
          stream: false,
        }),
        signal: AbortSignal.timeout(300_000),
      })
      await res.text()
      logLine(`=== model ready: ${model} ===`)
    } catch {
      logLine(`=== pre-warm failed for ${model} — will load on first request ===`)
    }
  }

  function touch(): void {
    // MLX Omni gerencia TTL internamente por modelo
    // touch() e um no-op aqui
  }
}

/** Aguarda o servidor MLX Omni ficar pronto com polling.
 * @param baseUrl - URL base do servidor
 * @param timeout - Timeout em ms
 */
async function waitForReady(baseUrl: string, timeout: number): Promise<void> {
  const start = Date.now()
  const interval = 500

  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(1_000) })
      if (res.ok) return
    } catch {
      // servidor ainda nao esta pronto
    }
    await Bun.sleep(interval)
  }

  throw new Error(`mlx-omni-server did not start within ${timeout}ms`)
}
