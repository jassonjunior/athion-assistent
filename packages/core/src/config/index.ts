/** @module config
 * Descrição: Módulo de configuração do Athion.
 * Reexporta o gerenciador de configurações, loaders de múltiplas fontes,
 * schema Zod e configuração padrão.
 */

/** createConfigManager - Fábrica do gerenciador de configurações */
export { createConfigManager } from './config'
/** ConfigManager - Interface do gerenciador de configurações */
export type { ConfigManager } from './config'
/** loadEnvConfig, loadGlobalConfig, loadProjectConfig - Loaders de configuração por fonte */
export { loadEnvConfig, loadGlobalConfig, loadProjectConfig } from './loader'
/** ConfigSchema - Schema Zod de validação da configuração */
/** DEFAULT_CONFIG - Configuração padrão com todos os valores default */
export { ConfigSchema, DEFAULT_CONFIG } from './schema'
/** Config - Tipo inferido do schema de configuração */
export type { Config } from './schema'
