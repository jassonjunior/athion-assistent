import type { Subprocess } from 'bun'

/** Configuracao do servidor vllm-mlx.
 * @typedef {Object} VllmServerConfig
 * @property {string} model - Caminho local do modelo ou ID do HuggingFace
 * @property {number} port - Porta do servidor (default: 8000)
 * @property {string} host - Host do servidor (default: localhost)
 * @property {boolean} enableToolChoice - Habilitar auto tool choice
 * @property {string} toolCallParser - Parser de tool calls (ex: 'qwen3_coder')
 * @property {number} startupTimeout - Timeout em ms para aguardar o servidor iniciar (default: 120000)
 * @property {number} ttlMinutes - TTL em minutos — para o servidor apos inatividade (0 = desativado)
 */
export interface VllmServerConfig {
  /** Caminho local do modelo ou ID do HuggingFace */
  model: string
  /** Porta do servidor (default: 8000) */
  port: number
  /** Host do servidor (default: localhost) */
  host: string
  /** Habilitar auto tool choice */
  enableToolChoice: boolean
  /** Parser de tool calls (ex: 'qwen3_coder') */
  toolCallParser: string
  /** Timeout em ms para aguardar o servidor iniciar (default: 120000) */
  startupTimeout: number
  /** TTL em minutos — para o servidor apos inatividade (0 = desativado) */
  ttlMinutes: number
}

/** Interface do VllmManager.
 * @typedef {Object} VllmManager
 * @property {function} isRunning - Verifica se o servidor esta rodando
 * @property {function} ensureRunning - Garante que o servidor esta rodando (inicia se necessario)
 * @property {function} stop - Para o servidor se foi iniciado por este manager
 * @property {function} swapModel - Troca o modelo, reiniciando o servidor
 * @property {function} touch - Registra atividade para reset do TTL
 * @property {string} baseUrl - URL base do servidor
 * @property {string} currentModel - Modelo atualmente carregado
 */
export interface VllmManager {
  /** Verifica se o servidor esta rodando */
  isRunning(): Promise<boolean>
  /** Garante que o servidor esta rodando (inicia se necessario) */
  ensureRunning(): Promise<void>
  /** Para o servidor se foi iniciado por este manager */
  stop(): void
  /** Troca o modelo, reiniciando o servidor */
  swapModel(modelPath: string): Promise<void>
  /** Registra atividade para reset do TTL */
  touch(): void
  /** URL base do servidor */
  readonly baseUrl: string
  /** Modelo atualmente carregado */
  readonly currentModel: string
}

/** Configuracao padrao do vllm-mlx.
 * @typedef {Object} VllmServerConfig
 * @property {string} model - Caminho local do modelo ou ID do HuggingFace
 * @property {number} port - Porta do servidor (default: 8000)
 * @property {string} host - Host do servidor (default: localhost)
 * @property {boolean} enableToolChoice - Habilitar auto tool choice
 * @property {string} toolCallParser - Parser de tool calls (ex: 'qwen3_coder')
 * @property {number} startupTimeout - Timeout em ms para aguardar o servidor iniciar (default: 120000)
 * @property {number} ttlMinutes - TTL em minutos — para o servidor apos inatividade (0 = desativado)
 */
const DEFAULT_CONFIG: VllmServerConfig = {
  model:
    '/Users/jassonjunior/.lmstudio/models/RepublicOfKorokke/Qwen3-Coder-Next-REAP-40B-A3B-mlx-mxfp4',
  port: 8000,
  host: 'localhost',
  enableToolChoice: true,
  toolCallParser: 'qwen3_coder',
  startupTimeout: 120_000,
  ttlMinutes: 30,
}

/** Cria um VllmManager que gerencia o ciclo de vida do vllm-mlx.
 * @param overrides - Configuracoes parciais para sobrescrever os defaults
 * @returns VllmManager
 */
export function createVllmManager(overrides?: Partial<VllmServerConfig>): VllmManager {
  const config: VllmServerConfig = { ...DEFAULT_CONFIG, ...overrides }
  const baseUrl = `http://${config.host}:${config.port}/v1`
  let serverProcess: Subprocess | null = null
  let activeModel = config.model
  let ttlTimer: ReturnType<typeof setTimeout> | null = null

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

  /** Verifica se o servidor esta rodando.
   * @returns {Promise<boolean>} true se o servidor esta rodando
   * @example
   * const isRunning = await isRunning()
   * console.log(isRunning) // true se o servidor esta rodando
   */
  async function isRunning(): Promise<boolean> {
    try {
      const res = await fetch(`${baseUrl}/models`)
      return res.ok
    } catch {
      return false
    }
  }

  /** Garante que o servidor esta rodando (inicia se necessario).
   * @returns {Promise<void>} void
   * @example
   * await ensureRunning()
   * console.log('Servidor iniciado')
   */
  async function ensureRunning(): Promise<void> {
    if (await isRunning()) {
      touch()
      return
    }
    serverProcess = startServer(activeModel, config)
    await waitForReady(baseUrl, config.startupTimeout)
    startTtlTimer()
  }

  /** Para o servidor se foi iniciado por este manager.
   * @returns {void} void
   * @example
   * stop()
   * console.log('Servidor parado')
   */
  function stop(): void {
    clearTtl()
    if (serverProcess) {
      serverProcess.kill()
      serverProcess = null
    }
  }

  /** Troca o modelo, reiniciando o servidor.
   * @param modelPath - Caminho local do modelo ou ID do HuggingFace
   * @returns {Promise<void>} void
   * @example
   * await swapModel('/Users/jassonjunior/.lmstudio/models/RepublicOfKorokke/Qwen3-Coder-Next-REAP-40B-A3B-mlx-mxfp4')
   * console.log('Modelo trocado')
   */
  async function swapModel(modelPath: string): Promise<void> {
    if (modelPath === activeModel && (await isRunning())) {
      touch()
      return
    }
    stop()
    activeModel = modelPath
    serverProcess = startServer(activeModel, config)
    await waitForReady(baseUrl, config.startupTimeout)
    startTtlTimer()
  }

  /** Registra atividade para reset do TTL.
   * @returns {void} void
   * @example
   * touch()
   * console.log('TTL resetado')
   */
  function touch(): void {
    if (config.ttlMinutes > 0) {
      startTtlTimer()
    }
  }

  /** Inicia o timer de TTL.
   * @returns {void} void
   * @example
   * startTtlTimer()
   * console.log('Timer de TTL iniciado')
   */
  function startTtlTimer(): void {
    if (config.ttlMinutes <= 0) return
    clearTtl()
    ttlTimer = setTimeout(() => {
      stop()
    }, config.ttlMinutes * 60_000)
  }

  /** Limpa o timer de TTL.
   * @returns {void} void
   * @example
   * clearTtl()
   * console.log('Timer de TTL limpo')
   */
  function clearTtl(): void {
    if (ttlTimer) {
      clearTimeout(ttlTimer)
      ttlTimer = null
    }
  }
}

/** Inicia o processo do vllm-mlx em background.
 * @param model - Caminho local do modelo ou ID do HuggingFace
 * @param config - Configuracao do servidor vllm-mlx
 * @returns {Subprocess} Processo do vllm-mlx
 * @example
 * const subprocess = startServer('/Users/jassonjunior/.lmstudio/models/RepublicOfKorokke/Qwen3-Coder-Next-REAP-40B-A3B-mlx-mxfp4', { port: 8000, host: 'localhost', enableToolChoice: true, toolCallParser: 'qwen3_coder', startupTimeout: 120000, ttlMinutes: 30 })
 * console.log('Servidor iniciado')
 */
function startServer(model: string, config: VllmServerConfig): Subprocess {
  const args = ['vllm-mlx', 'serve', model, '--port', String(config.port), '--host', config.host]

  if (config.enableToolChoice) {
    args.push('--enable-auto-tool-choice')
  }
  if (config.toolCallParser) {
    args.push('--tool-call-parser', config.toolCallParser)
  }

  return Bun.spawn(args, { stdout: 'inherit', stderr: 'inherit' })
}

/** Aguarda o servidor ficar pronto com polling.
 * @param baseUrl - URL base do servidor
 * @param timeout - Timeout em ms
 * @returns {Promise<void>} void
 * @example
 * await waitForReady('http://localhost:8000', 120000)
 * console.log('Servidor pronto')
 */
async function waitForReady(baseUrl: string, timeout: number): Promise<void> {
  const start = Date.now()
  const interval = 2000

  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${baseUrl}/models`)
      if (res.ok) return
    } catch {
      // servidor ainda nao esta pronto
    }
    await Bun.sleep(interval)
  }

  throw new Error(`vllm-mlx did not start within ${timeout}ms`)
}
