import type { Bus } from './bus/bus'
import { createBus } from './bus/bus'
import type { Config, ConfigManager } from './config'
import { createConfigManager } from './config'
import { createOrchestrator } from './orchestrator/orchestrator'
import { createPromptBuilder } from './orchestrator/prompt-builder'
import { createSessionManager } from './orchestrator/session'
import { createToolDispatcher } from './orchestrator/tool-dispatcher'
import type { Orchestrator } from './orchestrator/types'
import { createPermissionManager } from './permissions'
import type { ProviderLayer } from './provider'
import { createProviderLayer } from './provider'
import type { SkillManager } from './skills'
import { createSkillManager } from './skills'
import { createDatabaseManager } from './storage'
import type { SubAgentManager } from './subagent'
import { builtinAgents, createSubAgentManager } from './subagent'
import { createTokenManager } from './tokens'
import type { ToolRegistry } from './tools'
import { BUILTIN_TOOLS, createToolRegistry } from './tools'
import { createTaskTool } from './tools/task-tool'
import type { ToolDefinition } from './tools/types'

/**
 * Opcoes para inicializar o Athion core.
 * @param dbPath - Caminho do banco SQLite (default: ~/.athion/data.db)
 * @param skillsDir - Diretorio de skills .md (default: skills/ do package)
 * @param cliArgs - Overrides de configuracao via CLI
 */
export interface BootstrapOptions {
  dbPath?: string
  skillsDir?: string
  cliArgs?: Partial<Config>
}

/**
 * Resultado da inicializacao — todas as instancias prontas para uso.
 *
 * @typedef {Object} AthionCore
 * @property {Bus} bus - EventBus para comunicacao entre modulos
 * @property {ConfigManager} config - Gerenciador de configuracoes.
 * @property {ProviderLayer} provider - ProviderLayer para LLMs.
 * @property {SkillManager} skills - Gerenciador de skills.
 * @property {ToolRegistry} tools - Gerenciador de tools.
 * @property {SubAgentManager} subagents - Gerenciador de subagentes.
 * @property {Orchestrator} orchestrator - Orchestrator para orquestrar o fluxo de conversacao.
 * * @example
 * {
 *   bus: Bus,
 *   config: ConfigManager,
 *   provider: ProviderLayer,
 *   skills: SkillManager,
 *   tools: ToolRegistry,
 *   subagents: SubAgentManager,
 *   orchestrator: Orchestrator,
 * }
 */
export interface AthionCore {
  bus: Bus
  config: ConfigManager
  provider: ProviderLayer
  skills: SkillManager
  tools: ToolRegistry
  subagents: SubAgentManager
  orchestrator: Orchestrator
}

/**
 * Inicializa todos os modulos do Athion core na ordem correta
 * e conecta as dependencias entre eles.
 *
 * Ordem de inicializacao:
 * 1. Bus, Config, Tokens (independentes)
 * 2. Provider, Skills, Tools (independentes)
 * 3. Storage → Permissions
 * 4. SessionManager, PromptBuilder, ToolDispatcher
 * 5. SubAgentManager → TaskTool → registra no ToolRegistry
 * 6. Orchestrator (recebe tudo)
 *
 * @param options - Opcoes de inicializacao
 * @returns Todas as instancias prontas para uso
 */
export async function bootstrap(options: BootstrapOptions = {}): Promise<AthionCore> {
  const { dbPath = '~/.athion/data.db', skillsDir, cliArgs = {} } = options

  // Nível 0-1: Serviços independentes
  const { bus, config, tokens, provider, skills, tools } = createBaseServices(cliArgs)
  if (skillsDir) await skills.loadFromDirectory(skillsDir)

  // Nível 2-3: Storage, Permissions, Orchestrator helpers
  const resolvedDbPath = dbPath.replace('~', process.env.HOME ?? '.')
  const db = createDatabaseManager(resolvedDbPath)
  const permissions = createPermissionManager(db)
  const session = createSessionManager(db, tokens)
  const promptBuilder = createPromptBuilder(skills)
  const toolDispatcher = createToolDispatcher(tools, permissions)

  // Nível 4-5: SubAgents + TaskTool
  const subagents = createSubAgentManager({ config, provider, tools, skills })
  for (const agent of builtinAgents) subagents.registerAgent(agent)
  tools.register(createTaskTool({ subagents }) as ToolDefinition)

  // Nível 6: Orchestrator
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
  })

  return { bus, config, provider, skills, tools, subagents, orchestrator }
}

/**
 * Cria os servicos base que nao dependem de nada (niveis 0 e 1).
 */
function createBaseServices(cliArgs: Partial<Config>) {
  const bus = createBus()
  const config = createConfigManager(cliArgs)
  const tokens = createTokenManager({
    contextLimit: 128_000,
    compactionThreshold: 0.8,
    strategy: 'sliding-window',
  })
  const provider = createProviderLayer()
  const skills = createSkillManager()
  const tools = createToolRegistry()
  for (const tool of BUILTIN_TOOLS) tools.register(tool as ToolDefinition)
  return { bus, config, tokens, provider, skills, tools }
}
