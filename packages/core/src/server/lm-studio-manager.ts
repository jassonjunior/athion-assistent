/**
 * LmStudioManager — gerencia swap de modelos no LM Studio via CLI `lms`.
 *
 * O LM Studio REST API não expõe endpoints de load/unload de modelos.
 * Por isso usamos o CLI `lms unload` / `lms load` para garantir swap
 * sequencial sem dual-load → sem OOM.
 *
 * Fluxo de swap:
 * 1. `lms unload <modelo-atual>` → descarrega completamente da memória
 * 2. Aguarda 1s para OS liberar memória wired
 * 3. `lms load <novo-modelo>` → carrega e mantém em memória (bloqueante até pronto)
 *
 * Diferente do mlx-omni (kill+restart) e llama.cpp (keep_alive API),
 * o LM Studio CLI gerencia o ciclo de vida de forma nativa e segura.
 */

import { appendFile } from 'node:fs/promises'
import type { VllmManager } from './vllm-manager'

const LOG_PATH = '/tmp/lm-studio.log'

function ts(): string {
  return `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}]`
}

function logLine(line: string): void {
  appendFile(LOG_PATH, `${ts()} ${line}\n`).catch(() => {})
}

export interface LmStudioConfig {
  /** Porta do servidor LM Studio (default: 1234) */
  port: number
  /** Host do servidor LM Studio (default: 127.0.0.1) */
  host: string
  /** API key Bearer para autenticação (configurado no LM Studio Settings → API) */
  apiKey?: string
  /** Timeout em ms para aguardar o servidor responder (default: 5000) */
  serverTimeout: number
}

const DEFAULT_CONFIG: LmStudioConfig = {
  port: 1234,
  host: '127.0.0.1',
  serverTimeout: 5_000,
}

/**
 * Cria um VllmManager para LM Studio, fazendo swap via CLI `lms`.
 *
 * LM Studio deve estar instalado e o servidor ligado manualmente
 * (ou via LM Studio app). Este manager não inicia o servidor — apenas
 * gerencia o carregamento/descarregamento de modelos.
 *
 * @param overrides - Configurações parciais para sobrescrever os defaults
 * @returns VllmManager
 */
export function createLmStudioManager(overrides?: Partial<LmStudioConfig>): VllmManager {
  const config: LmStudioConfig = { ...DEFAULT_CONFIG, ...overrides }
  const baseUrl = `http://${config.host}:${config.port}/v1`
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
      const headers: Record<string, string> = {}
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`
      const res = await fetch(`${baseUrl}/models`, {
        headers,
        signal: AbortSignal.timeout(config.serverTimeout),
      })
      return res.ok
    } catch {
      return false
    }
  }

  async function ensureRunning(): Promise<void> {
    // LM Studio é um app GUI — não fazemos autoStart via spawn
    // Apenas verifica se está acessível
    if (!(await isRunning())) {
      logLine('=== LM Studio server not reachable — please start LM Studio app ===')
      return
    }

    // Auto-detecta modelo carregado na primeira chamada
    if (!activeModel) {
      await detectLoadedModel()
    }
  }

  /** Consulta /api/v0/models para descobrir qual modelo está carregado atualmente. */
  async function detectLoadedModel(): Promise<void> {
    try {
      const headers: Record<string, string> = {}
      if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`
      const res = await fetch(`http://${config.host}:${config.port}/api/v0/models`, {
        headers,
        signal: AbortSignal.timeout(3_000),
      })
      if (!res.ok) return
      const data = (await res.json()) as { data: Array<{ id: string; state: string }> }
      const loaded = data.data?.find((m) => m.state === 'loaded')
      if (loaded) {
        activeModel = loaded.id
        logLine(`=== detected loaded model: ${activeModel} ===`)
      }
    } catch {
      // ignora erros — activeModel permanece ''
    }
  }

  function stop(): void {
    // LM Studio é gerenciado pelo usuário — não matamos o processo
  }

  /**
   * Troca o modelo ativo usando CLI `lms`:
   * 1. `lms unload <modelo-atual>` — descarrega da memória
   * 2. Aguarda 1.5s para OS liberar memória wired
   * 3. `lms load <novo-modelo>` — carrega e aguarda até estar pronto
   */
  async function swapModel(model: string): Promise<void> {
    const previousModel = activeModel
    logLine(`=== swapping model: ${previousModel || 'none'} → ${model} ===`)

    // Unload do modelo anterior (se havia um)
    if (previousModel && previousModel !== model) {
      logLine(`=== unloading: ${previousModel} ===`)
      try {
        const proc = Bun.spawn(['lms', 'unload', previousModel], {
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const exitCode = await proc.exited
        const out = await new Response(proc.stdout as ReadableStream).text()
        const err = await new Response(proc.stderr as ReadableStream).text()
        logLine(`lms unload exit=${exitCode} stdout="${out.trim()}" stderr="${err.trim()}"`)
      } catch (e) {
        logLine(`lms unload failed: ${e instanceof Error ? e.message : String(e)}`)
      }

      // Aguarda OS liberar memória wired antes de carregar próximo
      await Bun.sleep(1_500)
    }

    activeModel = model

    // Load do novo modelo
    logLine(`=== loading: ${model} ===`)
    try {
      const proc = Bun.spawn(['lms', 'load', model], {
        stdout: 'pipe',
        stderr: 'pipe',
      })
      // lms load é bloqueante — aguarda até o modelo estar pronto
      const exitCode = await proc.exited
      const out = await new Response(proc.stdout as ReadableStream).text()
      const err = await new Response(proc.stderr as ReadableStream).text()
      logLine(`lms load exit=${exitCode} stdout="${out.trim()}" stderr="${err.trim()}"`)
      logLine(`=== model ready: ${model} ===`)
    } catch (e) {
      logLine(`lms load failed: ${e instanceof Error ? e.message : String(e)}`)
      logLine(`=== load failed for ${model} — will try on first request ===`)
    }
  }

  function touch(): void {
    // LM Studio mantém modelos carregados indefinidamente — touch() é no-op
  }
}
