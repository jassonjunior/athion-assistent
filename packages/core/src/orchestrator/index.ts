/** orchestrator/index
 * Descrição: Barrel file que re-exporta os módulos públicos do Orchestrator.
 */
export { createOrchestrator } from './orchestrator'
export type { OrchestratorDeps } from './orchestrator'
export { createPromptBuilder } from './prompt-builder'
export type { PromptBuilder } from './prompt-builder'
export { createSessionManager } from './session'
export type { SessionManager } from './session'
export { createToolDispatcher } from './tool-dispatcher'
export type { DispatchContext, ToolDispatcher } from './tool-dispatcher'
export type {
  AgentDefinition,
  Attachment,
  Orchestrator,
  OrchestratorEvent,
  Session,
  UserMessage,
} from './types'
