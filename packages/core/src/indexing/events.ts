/** Indexing Events
 * Descrição: Definições de eventos do Bus para o sistema de indexação.
 * Usados pelo Watcher, IndexQueue e IndexMetrics para comunicação desacoplada.
 */

import { z } from 'zod/v4'
import { defineBusEvent } from '../bus/bus'

/** fileChangedEvent
 * Descrição: Emitido pelo CodebaseWatcher quando um arquivo é criado, modificado ou removido
 */
export const fileChangedEvent = defineBusEvent(
  'codebase:file_changed',
  z.object({
    filePath: z.string(),
    changeType: z.enum(['add', 'change', 'unlink']),
  }),
)

/** indexingStartedEvent
 * Descrição: Emitido pela IndexQueue quando começa a indexar um arquivo
 */
export const indexingStartedEvent = defineBusEvent(
  'codebase:indexing_started',
  z.object({
    filePath: z.string(),
    queueSize: z.number(),
  }),
)

/** indexingCompletedEvent
 * Descrição: Emitido pela IndexQueue quando termina de indexar um arquivo
 */
export const indexingCompletedEvent = defineBusEvent(
  'codebase:indexing_completed',
  z.object({
    filePath: z.string(),
    durationMs: z.number(),
  }),
)

/** indexingFailedEvent
 * Descrição: Emitido pela IndexQueue quando falha ao indexar um arquivo
 */
export const indexingFailedEvent = defineBusEvent(
  'codebase:indexing_failed',
  z.object({
    filePath: z.string(),
    error: z.string(),
  }),
)

/** metricsUpdatedEvent
 * Descrição: Emitido periodicamente pelo IndexMetrics com estatísticas
 */
export const metricsUpdatedEvent = defineBusEvent(
  'codebase:metrics_updated',
  z.object({
    filesProcessed: z.number(),
    filesFailed: z.number(),
    totalDurationMs: z.number(),
    avgDurationMs: z.number(),
    failureRate: z.number(),
    lastIndexedAt: z.number().nullable(),
  }),
)
