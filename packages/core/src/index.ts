export { VERSION } from '@athion/shared'

// Bootstrap
export { bootstrap } from './bootstrap'
export type { AthionCore, BootstrapOptions } from './bootstrap'

// Logger
export { createLogger, logger } from './logger'
export type { Logger, LogLevel, LogEntry } from './logger'

// Bus
export { createBus, defineBusEvent } from './bus/bus'
export type { Bus, BusEventDef } from './bus/bus'

// Config
export { createConfigManager } from './config'
export type { Config, ConfigManager } from './config'

// Orchestrator
export { createOrchestrator } from './orchestrator/orchestrator'
export type { Orchestrator, OrchestratorEvent, Session, UserMessage } from './orchestrator/types'

// Plugins
export { createPluginManager, createPluginInstaller } from './plugins'
export type {
  PluginContext,
  PluginDefinition,
  PluginManager,
  PluginSearchResult,
  InstallResult,
} from './plugins'

// Permissions
export { createPermissionManager } from './permissions'
export type {
  PermissionManager,
  PermissionDecision,
  PermissionScope,
  PermissionRule,
} from './permissions'

// Provider
export { createProviderLayer } from './provider'
export type { ProviderLayer, StreamEvent, TokenUsage } from './provider'

// Skills
export { createSkillManager, createSkillRegistry } from './skills'
export type { SkillDefinition, SkillManager, SkillRegistry, SkillRegistryEntry } from './skills'

// Storage
export { createDatabaseManager } from './storage'
export type { DatabaseManager } from './storage'

// SubAgent
export { builtinAgents, createSubAgentManager } from './subagent'
export type { SubAgentConfig, SubAgentEvent, SubAgentManager, SubAgentTask } from './subagent'

// Tokens
export { createTokenManager } from './tokens'
export type { TokenManager } from './tokens'

// Telemetry
export { createTelemetry } from './telemetry'
export type { TelemetryConfig, TelemetryService, SpanContext } from './telemetry'

// Tools
export { createToolRegistry, defineTool } from './tools'
export type { ToolDefinition, ToolRegistry, ToolResult } from './tools'
export { createTaskTool } from './tools/task-tool'

// Indexing
export { createCodebaseIndexer } from './indexing'
export type {
  CodebaseIndexer,
  CodeChunk,
  SearchResult,
  IndexerConfig,
  IndexStats,
} from './indexing'
