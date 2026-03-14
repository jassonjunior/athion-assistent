/** IndexQueue
 * Descrição: Fila de indexação com concorrência limitada e deduplicação.
 * Processa tarefas de indexação emitindo eventos via Bus.
 * Deduplicação: se o mesmo arquivo já está na fila, substitui o antigo.
 */

import type { Bus } from '../bus/bus'
import type { CodebaseIndexer } from './manager'
import { indexingStartedEvent, indexingCompletedEvent, indexingFailedEvent } from './events'

/** IndexTask
 * Descrição: Tarefa de indexação pendente
 */
export interface IndexTask {
  /** filePath - Caminho do arquivo a indexar */
  filePath: string
  /** type - Tipo de operação */
  type: 'index' | 'delete'
}

/** IndexQueueConfig
 * Descrição: Configuração da fila de indexação
 */
export interface IndexQueueConfig {
  /** maxConcurrency - Máximo de indexações simultâneas (default: 2) */
  maxConcurrency?: number
}

/** IndexQueue
 * Descrição: Fila com concorrência limitada para indexação de arquivos.
 * Deduplicação por filePath — se arquivo já na fila, substitui a tarefa.
 */
export class IndexQueue {
  private queue: Map<string, IndexTask> = new Map()
  private activeCount = 0
  private maxConcurrency: number
  private indexer: CodebaseIndexer
  private bus: Bus
  private processing = false

  /** constructor
   * Descrição: Cria fila de indexação com concorrência configurável
   * @param indexer - Instância do CodebaseIndexer
   * @param bus - Event Bus para emissão de eventos
   * @param config - Configuração (maxConcurrency)
   */
  constructor(indexer: CodebaseIndexer, bus: Bus, config: IndexQueueConfig = {}) {
    this.indexer = indexer
    this.bus = bus
    this.maxConcurrency = config.maxConcurrency ?? 2
  }

  /** enqueue
   * Descrição: Adiciona tarefa na fila. Deduplicação: mesmo filePath sobrescreve.
   * @param task - Tarefa de indexação
   */
  enqueue(task: IndexTask): void {
    this.queue.set(task.filePath, task)
    this.processNext()
  }

  /** pending
   * Descrição: Número de tarefas na fila aguardando processamento
   */
  get pending(): number {
    return this.queue.size
  }

  /** active
   * Descrição: Número de tarefas sendo processadas agora
   */
  get active(): number {
    return this.activeCount
  }

  /** processNext
   * Descrição: Processa a próxima tarefa da fila se há slots disponíveis
   */
  private processNext(): void {
    if (this.activeCount >= this.maxConcurrency) return
    if (this.queue.size === 0) return

    const [filePath, task] = this.queue.entries().next().value as [string, IndexTask]
    this.queue.delete(filePath)

    this.activeCount++
    this.bus.publish(indexingStartedEvent, {
      filePath: task.filePath,
      queueSize: this.queue.size,
    })

    const start = Date.now()

    const promise =
      task.type === 'delete'
        ? this.indexer.deleteFile(task.filePath)
        : this.indexer.indexFile(task.filePath, true)

    promise
      .then(() => {
        this.bus.publish(indexingCompletedEvent, {
          filePath: task.filePath,
          durationMs: Date.now() - start,
        })
      })
      .catch((err: unknown) => {
        this.bus.publish(indexingFailedEvent, {
          filePath: task.filePath,
          error: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => {
        this.activeCount--
        this.processNext()
      })
  }
}
