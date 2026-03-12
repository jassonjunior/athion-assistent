import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Bus } from './bus/bus'
import { createLogger } from './logger'
import { createBus } from './bus/bus'
import type { Config, ConfigManager } from './config'
import { createConfigManager } from './config'
import type { CodebaseIndexer } from './indexing'
import { createCodebaseIndexer } from './indexing'
import { createOrchestrator } from './orchestrator/orchestrator'
import { createPromptBuilder } from './orchestrator/prompt-builder'
import { createSessionManager } from './orchestrator/session'
import { createToolDispatcher } from './orchestrator/tool-dispatcher'
import type { Orchestrator } from './orchestrator/types'
import type { PluginManager } from './plugins'
import { createPluginManager } from './plugins'
import { createPermissionManager } from './permissions'
import type { PermissionManager } from './permissions/types'
import type { ProviderLayer } from './provider'
import { createProviderLayer } from './provider'
import { createModelSwapProvider } from './provider/model-swap-provider'
import type { ProxyServer } from './server/proxy/proxy'
import { createProxy, createProxyReuse, isProxyHealthy } from './server/proxy/proxy'
import { ProxyConfigSchema } from './server/proxy/types'
import { createLlamaCppManager } from './server/llama-cpp-manager'
import { createLmStudioManager } from './server/lm-studio-manager'
import { createMlxOmniManager } from './server/mlx-omni-manager'
import type { VllmManager } from './server/vllm-manager'
import { createVllmManager } from './server/vllm-manager'
import type { SkillManager } from './skills'
import { createSkillManager } from './skills'
import { createDatabaseManager } from './storage'
import type { SubAgentManager } from './subagent'
import { builtinAgents, createSubAgentManager } from './subagent'
import { createTokenManager } from './tokens'
import { createSummarizationService } from './tokens/summarize'
import type { ToolRegistry } from './tools'
import { BUILTIN_TOOLS, createSearchCodebaseTool, createToolRegistry } from './tools'
import { createTaskTool } from './tools/task-tool'
import type { ToolDefinition } from './tools/types'

/** Opcoes para o bootstrap.
 * @typedef {Object} BootstrapOptions
 * @property {string} dbPath - Caminho do banco de dados
 * @property {string} skillsDir - Diretorio de skills
 * @property {Partial<Config>} cliArgs - Argumentos de linha de comando
 * @example
 * const options: BootstrapOptions = { dbPath: '~/.athion/data.db', skillsDir: '~/.athion/skills', cliArgs: { provider: 'vllm-mlx', model: 'Qwen3-Coder-Next-REAP-40B-A3B-mlx-mxfp4' } }
 */
export interface BootstrapOptions {
  dbPath?: string
  skillsDir?: string
  pluginsDir?: string
  /** Caminho do workspace para indexação do codebase (opcional) */
  workspacePath?: string
  /** Caminho do banco SQLite do índice (default: ~/.athion/index.db) */
  indexDbPath?: string
  /** Desabilita auto-start do vllm e proxy (útil quando rodando como sidecar) */
  skipVllm?: boolean
  cliArgs?: Partial<Config>
}

/** Core do Athion.
 * @typedef {Object} AthionCore
 * @property {Bus} bus - Bus de eventos
 * @property {ConfigManager} config - Configuracao do sistema
 * @property {ProviderLayer} provider - Provider do LLM
 * @property {SkillManager} skills - Gerenciador de skills
 * @property {ToolRegistry} tools - Registro de ferramentas
 * @property {SubAgentManager} subagents - Gerenciador de subagentes
 * @property {Orchestrator} orchestrator - Orquestrador
 * @property {VllmManager} vllm - Gerenciador do vllm-mlx
 * @property {ProxyServer | null} proxy - Proxy do sistema
 * @example
 * const core: AthionCore = { bus: createBus(), config: createConfigManager(), provider: createProviderLayer(), skills: createSkillManager(), tools: createToolRegistry(), subagents: createSubAgentManager(), orchestrator: createOrchestrator(), vllm: createVllmManager(), proxy: createProxy() }
 */
export interface AthionCore {
  bus: Bus
  config: ConfigManager
  provider: ProviderLayer
  skills: SkillManager
  tools: ToolRegistry
  plugins: PluginManager
  subagents: SubAgentManager
  orchestrator: Orchestrator
  permissions: PermissionManager
  vllm: VllmManager
  proxy: ProxyServer | null
  /** Indexador de codebase — disponível quando workspacePath foi configurado */
  indexer: CodebaseIndexer | null
}

/** Inicializa o core do Athion.
 * @param options - Opcoes para o bootstrap.
 * @returns {Promise<AthionCore>} Core do Athion
 * @example
 * const core = await bootstrap({ dbPath: '~/.athion/data.db', skillsDir: '~/.athion/skills', cliArgs: { provider: 'vllm-mlx', model: 'Qwen3-Coder-Next-REAP-40B-A3B-mlx-mxfp4' } })
 * console.log(core) // { bus: createBus(), config: createConfigManager(), provider: createProviderLayer(), skills: createSkillManager(), tools: createToolRegistry(), subagents: createSubAgentManager(), orchestrator: createOrchestrator(), vllm: createVllmManager(), proxy: createProxy() }
 */
export async function bootstrap(options: BootstrapOptions = {}): Promise<AthionCore> {
  const log = createLogger('bootstrap')

  const {
    dbPath = '~/.athion/data.db',
    skillsDir,
    pluginsDir,
    workspacePath,
    indexDbPath,
    skipVllm = false,
    cliArgs = {},
  } = options

  log.info({ dbPath, workspacePath }, 'initializing Athion core')

  const { bus, config, tokens, provider, skills, tools } = createBaseServices(cliArgs)

  // Set ATHION_VLLM_MLX_URL from backendPort if not already set
  if (!process.env['ATHION_VLLM_MLX_URL']) {
    const port = config.get('backendPort')
    process.env['ATHION_VLLM_MLX_URL'] = `http://localhost:${port}/v1`
    log.debug({ port }, 'set ATHION_VLLM_MLX_URL from backendPort')
  }

  // Set ATHION_MLX_OMNI_URL from mlxOmniPort if not already set
  if (!process.env['ATHION_MLX_OMNI_URL']) {
    const port = (config.get('mlxOmniPort') as number | undefined) ?? 10240
    process.env['ATHION_MLX_OMNI_URL'] = `http://localhost:${port}/v1`
    log.debug({ port }, 'set ATHION_MLX_OMNI_URL from mlxOmniPort')
  }

  if (skillsDir) {
    log.debug({ skillsDir }, 'loading skills from skillsDir')
    await skills.loadFromDirectory(skillsDir)
  }

  // Auto-carrega skills do Claude Code (~/.claude/skills/) se existirem
  const claudeSkillsDir = join(homedir(), '.claude', 'skills')
  const claudeLoaded = await skills.loadFromDirectory(claudeSkillsDir)
  if (claudeLoaded > 0) {
    log.info({ claudeSkillsDir, count: claudeLoaded }, 'loaded Claude Code skills')
  }

  // Auto-carrega skills do Athion (~/.athion/skills/) se existirem
  const athionSkillsDir = join(homedir(), '.athion', 'skills')
  const athionLoaded = await skills.loadFromDirectory(athionSkillsDir)
  if (athionLoaded > 0) {
    log.info({ athionSkillsDir, count: athionLoaded }, 'loaded Athion user skills')
  }

  const resolvedDbPath = dbPath.replace('~', process.env.HOME ?? '.')
  const db = createDatabaseManager(resolvedDbPath)
  const permissions = createPermissionManager(db)
  const session = createSessionManager(db, tokens)
  const promptBuilder = createPromptBuilder(skills)
  const toolDispatcher = createToolDispatcher(tools, permissions)

  const indexer = await setupIndexer(workspacePath, indexDbPath, tools)
  if (indexer) log.info({ workspacePath }, 'codebase indexer ready')

  // Cria server manager ANTES dos subagentes e orquestrador para poder usar ModelSwapProvider.
  // O manager depende do provider configurado:
  //   - 'mlx-omni'  → MlxOmniManager (hotload real via LRU+TTL, sem restart)
  //   - qualquer outro → VllmManager (kill+restart por swap)
  const providerName = config.get('provider') as string
  const { vllm, proxy } = skipVllm
    ? { vllm: createVllmManager({ port: 0, ttlMinutes: 0 }), proxy: null }
    : providerName === 'mlx-omni'
      ? { vllm: await setupMlxOmni(config), proxy: null }
      : providerName === 'lm-studio'
        ? { vllm: setupLmStudio(config), proxy: null }
        : providerName === 'llama-cpp'
          ? { vllm: setupLlamaCpp(config), proxy: null }
          : await setupVllmAndProxy(config)

  // Se orchestratorModel ou agentModel estiverem configurados, usa ModelSwapProvider
  // para fazer unload/load automático entre turnos do orquestrador e subagentes.
  // mlxOmniSingleModel=true desabilita o swap quando dois modelos grandes não cabem na memória.
  const singleModel = Boolean(config.get('mlxOmniSingleModel'))
  const effectiveProvider =
    config.get('orchestratorModel') || config.get('agentModel')
      ? createModelSwapProvider(provider, vllm, singleModel)
      : provider

  if (effectiveProvider !== provider) {
    log.info(
      {
        orchestratorModel: config.get('orchestratorModel'),
        agentModel: config.get('agentModel'),
        singleModel,
      },
      singleModel
        ? 'model swap DISABLED (mlxOmniSingleModel=true) — using single model for all turns'
        : 'model swap enabled — will unload/load models between orchestrator and subagent turns',
    )
  }

  const summarizer = createSummarizationService({
    provider: effectiveProvider,
    providerId: config.get('provider') as string,
    modelId: config.get('model') as string,
  })
  const subagents = createSubAgentManager({
    config,
    provider: effectiveProvider,
    tools,
    skills,
    summarizer,
  })
  for (const agent of builtinAgents) subagents.registerAgent(agent)
  tools.register(createTaskTool({ subagents }) as ToolDefinition)

  const plugins = createPluginManager({ bus, config, tools, provider: effectiveProvider })
  await plugins.loadFromDirectory(pluginsDir ?? '~/.athion/plugins')

  const orchestrator = createOrchestrator({
    config,
    bus,
    provider: effectiveProvider,
    tools,
    tokens,
    skills,
    session,
    promptBuilder,
    toolDispatcher,
    subagents,
  })

  log.info({ provider: config.get('provider'), model: config.get('model') }, 'bootstrap complete')

  return {
    bus,
    config,
    provider: effectiveProvider,
    skills,
    tools,
    plugins,
    subagents,
    orchestrator,
    permissions,
    vllm,
    proxy,
    indexer,
  }
}

/** Cria os servicos base do Athion.
 * @param cliArgs - Argumentos de linha de comando
 * @returns {Object} Servicos base do Athion
 * @example
 * const services = createBaseServices({ provider: 'vllm-mlx', model: 'Qwen3-Coder-Next-REAP-40B-A3B-mlx-mxfp4' })
 * console.log(services) // { bus: createBus(), config: createConfigManager(), tokens: createTokenManager(), provider: createProviderLayer(), skills: createSkillManager(), tools: createToolRegistry() }
 */
function createBaseServices(cliArgs: Partial<Config>) {
  const bus = createBus()
  const config = createConfigManager(cliArgs)
  const provider = createProviderLayer()

  // Summarizer usa o provider para chamar o LLM
  const summarizer = createSummarizationService({
    provider,
    providerId: config.get('provider') as string,
    modelId: config.get('model') as string,
  })

  const contextWindow = config.get('contextWindow')
  const tokens = createTokenManager({
    contextLimit: contextWindow,
    compactionThreshold: 0.9,
    strategy: 'summarize',
    summarizer,
  })

  const skills = createSkillManager()
  const tools = createToolRegistry()
  for (const tool of BUILTIN_TOOLS) tools.register(tool as ToolDefinition)
  return { bus, config, tokens, provider, skills, tools }
}

async function setupIndexer(
  workspacePath: string | undefined,
  indexDbPath: string | undefined,
  tools: ToolRegistry,
): Promise<CodebaseIndexer | null> {
  if (!workspacePath) return null
  const resolvedIndexDb = indexDbPath ?? join(homedir(), '.athion', 'index.db')
  const indexer = createCodebaseIndexer({
    workspacePath,
    dbPath: resolvedIndexDb,
    embeddingBaseUrl: process.env['ATHION_EMBEDDING_URL'] ?? '',
    embeddingModel: process.env['ATHION_EMBEDDING_MODEL'] ?? 'nomic-embed-text',
  })
  tools.register(createSearchCodebaseTool(indexer) as ToolDefinition)
  return indexer
}

function setupLmStudio(config: ConfigManager): VllmManager {
  const log = createLogger('bootstrap')
  const port = (config.get('lmStudioPort') as number | undefined) ?? 1234
  const host = (config.get('lmStudioHost') as string | undefined) ?? '127.0.0.1'
  const apiKey = config.get('lmStudioApiKey') as string | undefined

  // Define URL e API key para o registry
  process.env['ATHION_LM_STUDIO_URL'] = `http://${host}:${port}/v1`
  if (apiKey) process.env['ATHION_LM_STUDIO_API_KEY'] = apiKey

  log.info(
    { provider: 'lm-studio', host, port },
    'lm-studio manager configured — swap via lms CLI (unload → load)',
  )

  return createLmStudioManager({ port, host, ...(apiKey ? { apiKey } : {}) })
}

function setupLlamaCpp(config: ConfigManager): VllmManager {
  const log = createLogger('bootstrap')
  const port = (config.get('llamaCppPort') as number | undefined) ?? 8080
  const host = (config.get('llamaCppHost') as string | undefined) ?? '127.0.0.1'
  const autoStart = (config.get('llamaCppAutoStart') as boolean | undefined) ?? true
  const extraArgs = (config.get('llamaCppArgs') as string[] | undefined) ?? []

  process.env['ATHION_LLAMA_CPP_URL'] = `http://${host}:${port}/v1`

  log.info(
    { provider: 'llama-cpp', host, port, autoStart },
    'llama-cpp manager configured — swap via keep_alive (no kill+restart)',
  )

  return createLlamaCppManager({ port, host, autoStart, extraArgs })
}

async function setupMlxOmni(config: ConfigManager): Promise<VllmManager> {
  const log = createLogger('bootstrap')
  const port = (config.get('mlxOmniPort') as number | undefined) ?? 10240
  const autoStart = (config.get('mlxOmniAutoStart') as boolean | undefined) ?? true
  const ttlMinutes = (config.get('mlxOmniTtlMinutes') as number | undefined) ?? 30

  const mlxOmni = createMlxOmniManager({ port, autoStart, ttlMinutes })

  // Garante a URL do provider mlx-omni para a porta configurada
  process.env['ATHION_MLX_OMNI_URL'] = `http://localhost:${port}/v1`

  // Sempre verifica se está no ar. Se não estiver e autoStart=true, sobe o processo.
  // Se autoStart=false, ensureRunning() retorna sem fazer nada (usuário gerencia manualmente).
  log.info({ port, autoStart }, 'checking mlx-omni-server health')
  await mlxOmni.ensureRunning()

  if (await mlxOmni.isRunning()) {
    log.info({ port }, 'mlx-omni-server is ready')
  } else {
    log.warn(
      { port, autoStart },
      'mlx-omni-server is not running (autoStart=false or failed to start)',
    )
  }

  return mlxOmni
}

async function setupVllmAndProxy(
  config: ConfigManager,
): Promise<{ vllm: VllmManager; proxy: ProxyServer | null }> {
  const log = createLogger('bootstrap')
  const cfg = config.getAll()
  const vllm = createVllmManager({ port: cfg.backendPort, ttlMinutes: cfg.vllmTtlMinutes })

  let proxy: ProxyServer | null = null
  if (cfg.proxyEnabled) {
    // Verifica se já existe um proxy saudável na porta (outra instância do Athion)
    const alreadyRunning = await isProxyHealthy(cfg.proxyPort)
    if (alreadyRunning) {
      log.info({ port: cfg.proxyPort }, 'reusing existing proxy (another instance is running)')
      proxy = createProxyReuse(cfg.proxyPort)
    } else {
      const proxyConfig = ProxyConfigSchema.parse({
        proxyPort: cfg.proxyPort,
        backendPort: cfg.backendPort,
        contextWindow: cfg.contextWindow,
        maxOutputTokens: cfg.maxOutputTokens,
        logLevel: cfg.logLevel,
      })
      proxy = createProxy(proxyConfig)
    }
  }

  if (cfg.vllmAutoStart) await vllm.ensureRunning()
  if (proxy && proxy.isOwner) {
    proxy.start()
  }
  if (proxy) {
    process.env['ATHION_VLLM_MLX_URL'] = `${proxy.url}/v1`
  }

  return { vllm, proxy }
}
