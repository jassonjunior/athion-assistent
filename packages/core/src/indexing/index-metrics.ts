/** IndexMetrics
 * Descrição: Coleta métricas de indexação via Event Bus.
 * Escuta eventos de indexação (started/completed/failed) e agrega estatísticas.
 * Emite métricas periodicamente via Bus (30s).
 */

import type { Bus } from '../bus/bus'
import { indexingCompletedEvent, indexingFailedEvent, metricsUpdatedEvent } from './events'

/** METRICS_INTERVAL_MS
 * Descrição: Intervalo de emissão de métricas (30s)
 */
const METRICS_INTERVAL_MS = 30_000

/** IndexMetricsData
 * Descrição: Dados de métricas de indexação
 */
export interface IndexMetricsData {
  /** filesProcessed - Total de arquivos indexados com sucesso */
  filesProcessed: number
  /** filesFailed - Total de falhas de indexação */
  filesFailed: number
  /** totalDurationMs - Duração total acumulada em ms */
  totalDurationMs: number
  /** avgDurationMs - Duração média por arquivo em ms */
  avgDurationMs: number
  /** failureRate - Taxa de falha (0-1) */
  failureRate: number
  /** lastIndexedAt - Timestamp da última indexação (ms desde epoch) */
  lastIndexedAt: number | null
}

/** IndexMetrics
 * Descrição: Coletor de métricas de indexação que escuta o Event Bus.
 * Agrega filesProcessed, filesFailed, durations e emite periodicamente.
 */
export class IndexMetrics {
  private filesProcessed = 0
  private filesFailed = 0
  private totalDurationMs = 0
  private lastIndexedAt: number | null = null
  private bus: Bus
  private unsubscribes: Array<() => void> = []
  private emitTimer: ReturnType<typeof setInterval> | null = null

  /** constructor
   * Descrição: Cria coletor de métricas e registra listeners no Bus
   * @param bus - Event Bus para escutar eventos de indexação
   */
  constructor(bus: Bus) {
    this.bus = bus

    this.unsubscribes.push(
      bus.subscribe(indexingCompletedEvent, (data) => {
        this.filesProcessed++
        this.totalDurationMs += data.durationMs
        this.lastIndexedAt = Date.now()
      }),
    )

    this.unsubscribes.push(
      bus.subscribe(indexingFailedEvent, () => {
        this.filesFailed++
      }),
    )
  }

  /** startPeriodicEmit
   * Descrição: Inicia emissão periódica de métricas via Bus (a cada 30s)
   */
  startPeriodicEmit(): void {
    if (this.emitTimer) return
    this.emitTimer = setInterval(() => {
      this.bus.publish(metricsUpdatedEvent, this.getSnapshot())
    }, METRICS_INTERVAL_MS)
  }

  /** stopPeriodicEmit
   * Descrição: Para a emissão periódica de métricas
   */
  stopPeriodicEmit(): void {
    if (this.emitTimer) {
      clearInterval(this.emitTimer)
      this.emitTimer = null
    }
  }

  /** getSnapshot
   * Descrição: Retorna snapshot atual das métricas
   * @returns Dados de métricas calculados
   */
  getSnapshot(): IndexMetricsData {
    const total = this.filesProcessed + this.filesFailed
    return {
      filesProcessed: this.filesProcessed,
      filesFailed: this.filesFailed,
      totalDurationMs: this.totalDurationMs,
      avgDurationMs:
        this.filesProcessed > 0 ? Math.round(this.totalDurationMs / this.filesProcessed) : 0,
      failureRate: total > 0 ? this.filesFailed / total : 0,
      lastIndexedAt: this.lastIndexedAt,
    }
  }

  /** reset
   * Descrição: Reseta todas as métricas
   */
  reset(): void {
    this.filesProcessed = 0
    this.filesFailed = 0
    this.totalDurationMs = 0
    this.lastIndexedAt = null
  }

  /** dispose
   * Descrição: Limpa listeners e para emissão periódica
   */
  dispose(): void {
    this.stopPeriodicEmit()
    for (const unsub of this.unsubscribes) {
      unsub()
    }
    this.unsubscribes = []
  }
}
