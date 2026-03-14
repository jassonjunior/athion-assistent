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
import type { SkillManager, SkillRegistry } from './skills'
import { createSkillManager, createSkillRegistry } from './skills'
import { createDatabaseManager } from './storage'
import type { SubAgentManager } from './subagent'
import { builtinAgents, createSubAgentManager } from './subagent'
import { createTokenManager } from './tokens'
import { createSummarizationService } from './tokens/summarize'
import type { ToolRegistry } from './tools'
import { BUILTIN_TOOLS, createSearchCodebaseTool, createToolRegistry } from './tools'
import { createTaskTool } from './tools/task-tool'
import type { ToolDefinition } from './tools/types'

/** BootstrapOptions
 * Descrição: Opções de configuração para inicialização do core do Athion.
 * Permite customizar caminhos de banco de dados, diretórios de skills/plugins,
 * e comportamento de auto-start dos servidores LLM.
 */
export interface BootstrapOptions {
  /** dbPath - Caminho do arquivo SQLite principal (default: '~/.athion/data.db') */
  dbPath?: string
  /** skillsDir - Diretório adicional para carregar skills customizadas */
  skillsDir?: string
  /** pluginsDir - Diretório de plugins (default: '~/.athion/plugins') */
  pluginsDir?: string
  /** workspacePath - Caminho do workspace para indexação do codebase (opcional) */
  workspacePath?: string
  /** indexDbPath - Caminho do banco SQLite do índice (default: ~/.athion/index.db) */
  indexDbPath?: string
  /** skipVllm - Desabilita auto-start do vllm e proxy (útil quando rodando como sidecar) */
  skipVllm?: boolean
  /** cliArgs - Argumentos de linha de comando que sobrescrevem todas as outras fontes de config */
  cliArgs?: Partial<Config>
}

/** AthionCore
 * Descrição: Objeto principal retornado pelo bootstrap, contendo todos os serviços
 * inicializados e prontos para uso. Representa a instância completa do Athion.
 */
export interface AthionCore {
  /** bus - Bus de eventos pub/sub tipado com validação Zod */
  bus: Bus
  /** config - Gerenciador de configurações unificado (5 fontes) */
  config: ConfigManager
  /** provider - Camada de abstração para chamadas ao LLM */
  provider: ProviderLayer
  /** skills - Gerenciador de skills (carregamento e execução) */
  skills: SkillManager
  /** tools - Registro de ferramentas disponíveis para o LLM */
  tools: ToolRegistry
  /** plugins - Gerenciador de plugins (carregamento dinâmico) */
  plugins: PluginManager
  /** subagents - Gerenciador de subagentes especializados */
  subagents: SubAgentManager
  /** orchestrator - Orquestrador principal de conversas */
  orchestrator: Orchestrator
  /** permissions - Gerenciador de permissões (session + persistidas) */
  permissions: PermissionManager
  /** vllm - Gerenciador do servidor LLM (vllm-mlx, mlx-omni, llama-cpp ou lm-studio) */
  vllm: VllmManager
  /** proxy - Proxy reverso para o backend LLM (null se desabilitado) */
  proxy: ProxyServer | null
  /** indexer - Indexador de codebase para busca semântica (null se workspacePath não configurado) */
  indexer: CodebaseIndexer | null
  /** skillRegistry - Registry de skills para busca e instalação do catálogo */
  skillRegistry: SkillRegistry
}

/** bootstrap
 * Descrição: Inicializa todos os serviços do core do Athion e retorna a instância completa.
 * Configura bus, config, provider, skills, tools, plugins, subagentes, orquestrador,
 * permissões, servidor LLM e proxy.
 * @param options - Opções de configuração para o bootstrap
 * @returns Instância completa do AthionCore com todos os serviços prontos
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

  const skillRegistry = createSkillRegistry(skills)
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
    skillRegistry,
  }
}

/** createBaseServices
 * Descrição: Cria os serviços base do Athion (bus, config, tokens, provider, skills, tools).
 * Estes serviços são independentes e não precisam de servidor LLM rodando.
 * @param cliArgs - Argumentos de linha de comando que sobrescrevem a configuração
 * @returns Objeto com os serviços base inicializados
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

/** setupIndexer
 * Descrição: Configura o indexador de codebase para busca semântica.
 * Cria o indexador e registra a ferramenta de busca no ToolRegistry.
 * @param workspacePath - Caminho do workspace a ser indexado (undefined para pular)
 * @param indexDbPath - Caminho do banco de índice (default: ~/.athion/index.db)
 * @param tools - Registry de ferramentas onde a busca será registrada
 * @returns Instância do CodebaseIndexer ou null se workspacePath não informado
 */
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

/** setupLmStudio
 * Descrição: Configura o gerenciador do LM Studio para swap de modelos via lms CLI.
 * Define as variáveis de ambiente necessárias para o provider.
 * @param config - Gerenciador de configurações do Athion
 * @returns Instância do VllmManager configurada para LM Studio
 */
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

/** setupLlamaCpp
 * Descrição: Configura o gerenciador do llama-cpp para swap de modelos via keep_alive.
 * Define as variáveis de ambiente e opções de auto-start.
 * @param config - Gerenciador de configurações do Athion
 * @returns Instância do VllmManager configurada para llama-cpp
 */
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

/** setupMlxOmni
 * Descrição: Configura o gerenciador do mlx-omni-server com hotload LRU+TTL.
 * Verifica saúde do servidor e faz auto-start se configurado.
 * @param config - Gerenciador de configurações do Athion
 * @returns Instância do VllmManager configurada para mlx-omni
 */
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

/** setupVllmAndProxy
 * Descrição: Configura o gerenciador vllm-mlx e o proxy reverso.
 * Reutiliza proxy existente se já houver outra instância rodando na porta.
 * @param config - Gerenciador de configurações do Athion
 * @returns Objeto com o VllmManager e o ProxyServer (ou null se proxy desabilitado)
 */
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
