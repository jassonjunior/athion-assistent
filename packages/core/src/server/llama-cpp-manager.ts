import { appendFile } from 'node:fs/promises'
import type { Subprocess } from 'bun'
import type { VllmManager } from './vllm-manager'

const LOG_PATH = '/tmp/llama-cpp.log'

function ts(): string {
  return `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}]`
}

function logLine(line: string): void {
  appendFile(LOG_PATH, `${ts()} ${line}\n`).catch(() => {})
}

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

export interface LlamaCppConfig {
  /** Porta do servidor (default: 8080) */
  port: number
  /** Host do servidor (default: 127.0.0.1) */
  host: string
  /** Iniciar automaticamente se não estiver rodando */
  autoStart: boolean
  /** Timeout em ms para aguardar o servidor iniciar (default: 30000) */
  startupTimeout: number
  /** Args extras para o llama-server (ex: ["--n-gpu-layers", "99"]) */
  extraArgs: string[]
}

const DEFAULT_CONFIG: LlamaCppConfig = {
  port: 8080,
  host: '127.0.0.1',
  autoStart: true,
  startupTimeout: 30_000,
  extraArgs: [],
}

/**
 * Cria um VllmManager para o llama-server (llama.cpp).
 *
 * Diferente do mlx-omni, o swap de modelos aqui é feito via keep_alive:
 * - Antes do swap: envia dummy request com keep_alive=0 → força unload imediato
 * - Aguarda 1s para o OS liberar memória
 * - Pre-warm: carrega novo modelo com keep_alive=-1 (mantém em memória)
 *
 * O llama-server roda em router mode (sem --model), aceitando qualquer
 * modelo por request via o campo "model" no body.
 *
 * @param overrides - Configurações parciais para sobrescrever os defaults
 * @returns VllmManager
 */
export function createLlamaCppManager(overrides?: Partial<LlamaCppConfig>): VllmManager {
  const config: LlamaCppConfig = { ...DEFAULT_CONFIG, ...overrides }
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
    if (await isRunning()) return
    if (!config.autoStart) return

    logLine(`=== llama-server starting on port ${config.port} ===`)
    serverProcess = Bun.spawn(
      ['llama-server', '--host', config.host, '--port', String(config.port), ...config.extraArgs],
      { stdout: 'pipe', stderr: 'pipe' },
    )
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

  /**
   * Troca o modelo ativo sem matar o processo llama-server.
   *
   * Estratégia keep_alive:
   * 1. Envia request com keep_alive=0 no modelo anterior → unload imediato após a chamada
   * 2. Aguarda 1s para OS liberar memória wired
   * 3. Pre-warm com novo modelo (keep_alive=-1) → carrega e mantém em memória
   *
   * Resultado: swap sequencial garantido — nunca dois modelos grandes na memória ao mesmo tempo.
   */
  async function swapModel(model: string): Promise<void> {
    const previousModel = activeModel
    logLine(`=== swapping model: ${previousModel || 'none'} → ${model} ===`)

    if (previousModel && previousModel !== model) {
      logLine(`=== unloading: ${previousModel} ===`)
      try {
        // keep_alive=0 força o llama-server a descarregar o modelo após esta request
        await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: previousModel,
            messages: [{ role: 'user', content: ' ' }],
            max_tokens: 1,
            keep_alive: 0,
          }),
          signal: AbortSignal.timeout(15_000),
        })
      } catch {
        // ignora erros de unload — modelo pode já ter sido descarregado
      }
      // Aguarda OS liberar memória wired antes de carregar o próximo modelo
      await Bun.sleep(1_500)
    }

    activeModel = model

    // Pre-warm: carrega o novo modelo com keep_alive=-1 (mantém em memória indefinidamente)
    logLine(`=== pre-warming: ${model} ===`)
    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: ' ' }],
          max_tokens: 5,
          keep_alive: -1,
        }),
        signal: AbortSignal.timeout(300_000), // 5 min — carregamento de modelos grandes pode demorar
      })
      await res.text()
      logLine(`=== model ready: ${model} ===`)
    } catch {
      logLine(`=== pre-warm failed for ${model} — will load on first request ===`)
    }
  }

  function touch(): void {
    // llama-server gerencia TTL via keep_alive por request — touch() é no-op
  }
}

async function waitForReady(baseUrl: string, timeout: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${baseUrl}/models`, { signal: AbortSignal.timeout(1_000) })
      if (res.ok) return
    } catch {
      // servidor ainda não está pronto
    }
    await Bun.sleep(500)
  }
  throw new Error(`llama-server did not start within ${timeout}ms`)
}
