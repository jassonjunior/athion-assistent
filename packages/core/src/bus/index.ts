/** @module bus
 * Descrição: Módulo do Event Bus — sistema pub/sub tipado com validação Zod.
 * Reexporta a fábrica do bus, definição de eventos e todos os eventos builtin.
 */

/** createBus - Fábrica do Event Bus */
/** defineBusEvent - Fábrica de definições de eventos tipadas */
export { createBus, defineBusEvent } from './bus'
/** Bus, BusEventDef - Tipos do sistema de eventos */
export type { Bus, BusEventDef } from './bus'
/** Eventos builtin do sistema (stream, subagent, system, plugin, codebase) */
export {
  ConfigChanged,
  FileChanged,
  IndexingCompleted,
  IndexingFailed,
  IndexingStarted,
  PermissionRequest,
  PluginError,
  PluginLoaded,
  PluginUnloaded,
  StreamComplete,
  StreamContent,
  StreamStart,
  StreamToolCall,
  StreamToolResult,
  SubagentComplete,
  SubagentProgress,
  SubagentStart,
} from './events'
