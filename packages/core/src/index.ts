/** @module @athion/core
 * Descrição: Ponto de entrada principal do pacote @athion/core.
 * Reexporta todos os módulos públicos do sistema: bootstrap, logger, bus,
 * config, orchestrator, plugins, permissions, provider, skills, storage,
 * subagent, tokens, telemetry, tools e indexing.
 */

/** VERSION - Versão atual do pacote @athion/shared */
export { VERSION } from '@athion/shared'

// ─── Bootstrap ──────────────────────────────────────────────────
/** bootstrap - Função de inicialização do core */
export { bootstrap } from './bootstrap'
/** AthionCore, BootstrapOptions - Tipos do bootstrap */
export type { AthionCore, BootstrapOptions } from './bootstrap'

// ─── Logger ─────────────────────────────────────────────────────
/** createLogger, logger - Fábrica e instância padrão do logger */
export { createLogger, logger } from './logger'
/** Logger, LogLevel, LogEntry - Tipos do sistema de logging */
export type { Logger, LogLevel, LogEntry } from './logger'

// ─── Bus ────────────────────────────────────────────────────────
/** createBus, defineBusEvent - Fábrica do bus e definição de eventos */
export { createBus, defineBusEvent } from './bus/bus'
/** Bus, BusEventDef - Tipos do sistema de eventos */
export type { Bus, BusEventDef } from './bus/bus'

// ─── Config ─────────────────────────────────────────────────────
/** createConfigManager - Fábrica do gerenciador de configurações */
export { createConfigManager } from './config'
/** Config, ConfigManager - Tipos do sistema de configuração */
export type { Config, ConfigManager } from './config'

// ─── Orchestrator ───────────────────────────────────────────────
/** createOrchestrator - Fábrica do orquestrador de conversas */
export { createOrchestrator } from './orchestrator/orchestrator'
/** Orchestrator, OrchestratorEvent, Session, UserMessage - Tipos do orquestrador */
export type { Orchestrator, OrchestratorEvent, Session, UserMessage } from './orchestrator/types'

// ─── Plugins ────────────────────────────────────────────────────
/** createPluginManager, createPluginInstaller - Fábricas do sistema de plugins */
export { createPluginManager, createPluginInstaller } from './plugins'
/** PluginContext, PluginDefinition, PluginManager, PluginSearchResult, InstallResult - Tipos de plugins */
export type {
  PluginContext,
  PluginDefinition,
  PluginManager,
  PluginSearchResult,
  InstallResult,
} from './plugins'

// ─── Permissions ────────────────────────────────────────────────
/** createPermissionManager - Fábrica do gerenciador de permissões */
export { createPermissionManager } from './permissions'
/** PermissionManager, PermissionDecision, PermissionScope, PermissionRule - Tipos de permissões */
export type {
  PermissionManager,
  PermissionDecision,
  PermissionScope,
  PermissionRule,
} from './permissions'

// ─── Provider ───────────────────────────────────────────────────
/** createProviderLayer - Fábrica da camada de abstração do LLM */
export { createProviderLayer } from './provider'
/** ProviderLayer, StreamEvent, TokenUsage - Tipos do provider */
export type { ProviderLayer, StreamEvent, TokenUsage } from './provider'

// ─── Skills ─────────────────────────────────────────────────────
/** createSkillManager, createSkillRegistry - Fábricas do sistema de skills */
export { createSkillManager, createSkillRegistry } from './skills'
/** SkillDefinition, SkillManager, SkillRegistry, SkillRegistryEntry, SkillSearchResult - Tipos de skills */
export type {
  SkillDefinition,
  SkillManager,
  SkillRegistry,
  SkillRegistryEntry,
  SkillSearchResult,
} from './skills'

// ─── Storage ────────────────────────────────────────────────────
/** createDatabaseManager - Fábrica do gerenciador de banco SQLite */
export { createDatabaseManager } from './storage'
/** DatabaseManager - Tipo do gerenciador de banco de dados */
export type { DatabaseManager } from './storage'

// ─── SubAgent ───────────────────────────────────────────────────
/** builtinAgents, createSubAgentManager - Agentes builtin e fábrica do gerenciador */
export { builtinAgents, createSubAgentManager } from './subagent'
/** SubAgentConfig, SubAgentEvent, SubAgentManager, SubAgentTask - Tipos de subagentes */
export type { SubAgentConfig, SubAgentEvent, SubAgentManager, SubAgentTask } from './subagent'

// ─── Tokens ─────────────────────────────────────────────────────
/** createTokenManager - Fábrica do gerenciador de tokens */
export { createTokenManager } from './tokens'
/** TokenManager - Tipo do gerenciador de tokens */
export type { TokenManager } from './tokens'

// ─── Telemetry ──────────────────────────────────────────────────
/** createTelemetry - Fábrica do serviço de telemetria */
export { createTelemetry } from './telemetry'
/** TelemetryConfig, TelemetryService, SpanContext - Tipos de telemetria */
export type { TelemetryConfig, TelemetryService, SpanContext } from './telemetry'

// ─── Tools ──────────────────────────────────────────────────────
/** createToolRegistry, defineTool - Fábrica do registro e definição de ferramentas */
export { createToolRegistry, defineTool } from './tools'
/** ToolDefinition, ToolRegistry, ToolResult - Tipos de ferramentas */
export type { ToolDefinition, ToolRegistry, ToolResult } from './tools'
/** createTaskTool - Fábrica da ferramenta de delegação para subagentes */
export { createTaskTool } from './tools/task-tool'

// ─── Indexing ───────────────────────────────────────────────────
/** createCodebaseIndexer - Fábrica do indexador de codebase para busca semântica */
export { createCodebaseIndexer } from './indexing'
/** indexingProgressEvent - Evento de progresso da indexação do codebase */
export { indexingProgressEvent } from './indexing'
/** CodebaseIndexer, CodeChunk, SearchResult, IndexerConfig, IndexStats - Tipos de indexação */
export type {
  CodebaseIndexer,
  CodeChunk,
  SearchResult,
  IndexerConfig,
  IndexStats,
} from './indexing'
