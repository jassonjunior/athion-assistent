import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Bus } from './bus/bus'
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
import type { ProxyServer } from './server/proxy/proxy'
import { createProxy } from './server/proxy/proxy'
import { ProxyConfigSchema } from './server/proxy/types'
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
  const {
    dbPath = '~/.athion/data.db',
    skillsDir,
    pluginsDir,
    workspacePath,
    indexDbPath,
    cliArgs = {},
  } = options

  const { bus, config, tokens, provider, skills, tools } = createBaseServices(cliArgs)
  if (skillsDir) await skills.loadFromDirectory(skillsDir)

  const resolvedDbPath = dbPath.replace('~', process.env.HOME ?? '.')
  const db = createDatabaseManager(resolvedDbPath)
  const permissions = createPermissionManager(db)
  const session = createSessionManager(db, tokens)
  const promptBuilder = createPromptBuilder(skills)
  const toolDispatcher = createToolDispatcher(tools, permissions)

  const indexer = await setupIndexer(workspacePath, indexDbPath, tools)

  const summarizer = createSummarizationService({
    provider,
    providerId: config.get('provider') as string,
    modelId: config.get('model') as string,
  })
  const subagents = createSubAgentManager({ config, provider, tools, skills, summarizer })
  for (const agent of builtinAgents) subagents.registerAgent(agent)
  tools.register(createTaskTool({ subagents }) as ToolDefinition)

  const plugins = createPluginManager({ bus, config, tools, provider })
  await plugins.loadFromDirectory(pluginsDir ?? '~/.athion/plugins')

  const orchestrator = createOrchestrator({
    config,
    bus,
    provider,
    tools,
    tokens,
    skills,
    session,
    promptBuilder,
    toolDispatcher,
    subagents,
  })

  const { vllm, proxy } = await setupVllmAndProxy(config)

  return {
    bus,
    config,
    provider,
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

async function setupVllmAndProxy(
  config: ConfigManager,
): Promise<{ vllm: VllmManager; proxy: ProxyServer | null }> {
  const cfg = config.getAll()
  const vllm = createVllmManager({ port: cfg.backendPort, ttlMinutes: cfg.vllmTtlMinutes })

  let proxy: ProxyServer | null = null
  if (cfg.proxyEnabled) {
    const proxyConfig = ProxyConfigSchema.parse({
      proxyPort: cfg.proxyPort,
      backendPort: cfg.backendPort,
      contextWindow: cfg.contextWindow,
      maxOutputTokens: cfg.maxOutputTokens,
      logLevel: cfg.logLevel,
    })
    proxy = createProxy(proxyConfig)
  }

  if (cfg.vllmAutoStart) await vllm.ensureRunning()
  if (proxy) {
    proxy.start()
    process.env['ATHION_VLLM_MLX_URL'] = `${proxy.url}/v1`
  }

  return { vllm, proxy }
}
