/** flow-events
 * Descricao: Definicao do evento unificado flowEvent para o Flow Observer.
 * Todos os eventos do Orchestrator e SubAgents sao publicados via Bus
 * usando esta definicao, permitindo observacao em tempo real do fluxo.
 */

import { z } from 'zod/v4'
import { defineBusEvent } from '../bus/bus'

/** FlowEventType
 * Descricao: Tipos possiveis de eventos no fluxo do Orchestrator/SubAgents.
 */
export const flowEventTypes = [
  'user_message',
  'system_prompt',
  'llm_content',
  'tool_call',
  'tool_result',
  'subagent_start',
  'subagent_content',
  'subagent_tool_call',
  'subagent_tool_result',
  'subagent_continuation',
  'subagent_complete',
  'model_loading',
  'model_ready',
  'finish',
  'error',
] as const

/** flowEventSchema
 * Descricao: Schema Zod para validacao do payload do flowEvent.
 */
export const flowEventSchema = z.object({
  /** id — Identificador unico do evento */
  id: z.string(),
  /** type — Tipo do evento no fluxo */
  type: z.enum(flowEventTypes),
  /** timestamp — Momento em que o evento ocorreu (epoch ms) */
  timestamp: z.number(),
  /** data — Dados arbitrarios associados ao evento */
  data: z.record(z.string(), z.unknown()),
  /** parentId — ID do evento pai (para eventos de subagentes) */
  parentId: z.string().optional(),
})

/** FlowEventData
 * Descricao: Tipo inferido do schema do flowEvent.
 */
export type FlowEventData = z.infer<typeof flowEventSchema>

/** flowEvent
 * Descricao: Definicao do evento de bus para o Flow Observer.
 * Publicado em cada ponto relevante do Orchestrator e SubAgents.
 */
export const flowEvent = defineBusEvent('flow:event', flowEventSchema)

/** createFlowEvent
 * Descricao: Helper para criar um FlowEventData com id e timestamp automaticos.
 * @param type - Tipo do evento
 * @param data - Dados do evento
 * @param parentId - ID do evento pai (opcional, para subagentes)
 * @returns FlowEventData pronto para publicar
 */
export function createFlowEvent(
  type: FlowEventData['type'],
  data: Record<string, unknown>,
  parentId?: string,
): FlowEventData {
  return {
    id: crypto.randomUUID(),
    type,
    timestamp: Date.now(),
    data,
    ...(parentId ? { parentId } : {}),
  }
}
