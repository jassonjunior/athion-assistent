/** plugins/index
 * Descrição: Barrel file do módulo de plugins. Re-exporta todas as funções,
 * interfaces e tipos públicos do sistema de plugins do Athion.
 */
export { createPluginInstaller } from './installer'
export type { InstallResult, InstallerOptions, PluginSearchResult } from './installer'
export { createPluginManager } from './manager'
export type { PluginManagerDeps } from './manager'
export { scaffoldPlugin } from './scaffold'
export type { ScaffoldOptions } from './scaffold'
export type {
  LoadedPlugin,
  PluginContext,
  PluginDefinition,
  PluginLogger,
  PluginManager,
} from './types'
