import { z } from 'zod/v4'
import { defineBusEvent } from './bus'

/**
 * Stream Events
 * @returns {z.ZodObject<StreamStart>} Stream Start
 * @returns {z.ZodObject<StreamContent>} Stream Content
 * @returns {z.ZodObject<StreamToolCall>} Stream Tool Call
 * @returns {z.ZodObject<StreamToolResult>} Stream Tool Result
 * @returns {z.ZodObject<StreamComplete>} Stream Complete
 */
export const StreamStart = defineBusEvent(
  'stream.start',
  z.object({
    sessionId: z.string(),
  }),
)

/**
 * Stream Content
 * @returns {z.ZodObject<StreamContent>} Stream Content
 */
export const StreamContent = defineBusEvent(
  'stream.content',
  z.object({
    sessionId: z.string(),
    content: z.string(),
    index: z.number(),
  }),
)

/**
 * Stream Tool Call
 * @returns {z.ZodObject<StreamToolCall>} Stream Tool Call
 */
export const StreamToolCall = defineBusEvent(
  'stream.tool_call',
  z.object({
    sessionId: z.string(),
    toolName: z.string(),
    args: z.unknown(),
  }),
)

/**
 * Stream Tool Result
 * @returns {z.ZodObject<StreamToolResult>} Stream Tool Result
 */
export const StreamToolResult = defineBusEvent(
  'stream.tool_result',
  z.object({
    sessionId: z.string(),
    toolName: z.string(),
    result: z.unknown(),
  }),
)

/**
 * Stream Complete
 * @returns {z.ZodObject<StreamComplete>} Stream Complete
 */
export const StreamComplete = defineBusEvent(
  'stream.complete',
  z.object({
    sessionId: z.string(),
  }),
)

// ─── Subagent Events ────────────────────────────────────────────

/**
 * Subagent Start
 * @returns {z.ZodObject<SubagentStart>} Subagent Start
 */
export const SubagentStart = defineBusEvent(
  'subagent.start',
  z.object({
    sessionId: z.string(),
    agentName: z.string(),
  }),
)

/**
 * Subagent Progress
 * @returns {z.ZodObject<SubagentProgress>} Subagent Progress
 */
export const SubagentProgress = defineBusEvent(
  'subagent.progress',
  z.object({
    sessionId: z.string(),
    agentName: z.string(),
    data: z.unknown(),
  }),
)

/**
 * Subagent Complete
 * @returns {z.ZodObject<SubagentComplete>} Subagent Complete
 */
export const SubagentComplete = defineBusEvent(
  'subagent.complete',
  z.object({
    sessionId: z.string(),
    agentName: z.string(),
    result: z.unknown(),
  }),
)

// ─── System Events ──────────────────────────────────────────────

/**
 * Permission Request
 * @returns {z.ZodObject<PermissionRequest>} Permission Request
 */
export const PermissionRequest = defineBusEvent(
  'permission.request',
  z.object({
    action: z.string(),
    target: z.string(),
  }),
)

/**
 * Config Changed
 * @returns {z.ZodObject<ConfigChanged>} Config Changed
 */
export const ConfigChanged = defineBusEvent(
  'config.changed',
  z.object({
    key: z.string(),
    value: z.unknown(),
  }),
)

// ─── Plugin Events ───────────────────────────────────────────────

/**
 * Plugin Loaded — emitido quando um plugin é carregado com sucesso.
 */
export const PluginLoaded = defineBusEvent(
  'plugin.loaded',
  z.object({
    name: z.string(),
    version: z.string(),
    toolsRegistered: z.array(z.string()),
  }),
)

/**
 * Plugin Unloaded — emitido quando um plugin é descarregado.
 */
export const PluginUnloaded = defineBusEvent(
  'plugin.unloaded',
  z.object({
    name: z.string(),
  }),
)

/**
 * Plugin Error — emitido quando um plugin falha ao carregar.
 */
export const PluginError = defineBusEvent(
  'plugin.error',
  z.object({
    name: z.string(),
    error: z.string(),
  }),
)
