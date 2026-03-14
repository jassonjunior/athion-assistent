/** DualWriteManager
 * Descrição: Gerencia escrita dual entre SQLite (fonte de verdade) e Qdrant.
 * SQLite é sempre escrito primeiro. Qdrant é best-effort.
 * Reconciliação reconstrói Qdrant a partir do SQLite em batches.
 */

import type { VectorStorePort, VectorPoint } from './ports/vector-store.port'

/** RECONCILE_BATCH_SIZE
 * Descrição: Tamanho do batch para reconciliação
 */
const RECONCILE_BATCH_SIZE = 100

/** COLLECTIONS
 * Descrição: Coleções para reconciliação
 */
const COLLECTIONS = ['symbols', 'files', 'modules', 'patterns', 'repo_meta'] as const

/** DualWriteManager
 * Descrição: Escrita dual SQLite → Qdrant com reconciliação.
 * SQLite é fonte de verdade, Qdrant é otimização de busca.
 */
export class DualWriteManager {
  private driftCount = 0

  constructor(
    private source: VectorStorePort,
    private target: VectorStorePort,
    private onDrift?: (collection: string, error: string) => void,
  ) {}

  /** write
   * Descrição: Escreve no source (SQLite) primeiro, depois no target (Qdrant)
   * @param collection - Nome da coleção
   * @param points - Pontos a escrever
   */
  async write(collection: string, points: VectorPoint[]): Promise<void> {
    await this.source.upsertPoints(collection, points)

    try {
      const targetAvailable = await this.target.isAvailable()
      if (targetAvailable) {
        await this.target.upsertPoints(collection, points)
      }
    } catch (e) {
      this.driftCount++
      const message = e instanceof Error ? e.message : String(e)
      this.onDrift?.(collection, message)
    }
  }

  /** reconcile
   * Descrição: Reconstrói uma coleção do target a partir do source em batches
   * @param collection - Nome da coleção a reconciliar
   * @returns Número de pontos reconciliados
   */
  async reconcile(collection: string): Promise<number> {
    const targetAvailable = await this.target.isAvailable()
    if (!targetAvailable) return 0

    let totalReconciled = 0
    let offset: string | number | undefined

    while (true) {
      const page = await this.source.scroll(collection, RECONCILE_BATCH_SIZE, offset)
      if (page.points.length === 0) break

      await this.target.upsertPoints(collection, page.points)
      totalReconciled += page.points.length

      if (!page.nextOffset) break
      offset = page.nextOffset
    }

    return totalReconciled
  }

  /** reconcileAll
   * Descrição: Reconcilia todas as coleções
   * @returns Mapa de coleção → número de pontos reconciliados
   */
  async reconcileAll(): Promise<Map<string, number>> {
    const results = new Map<string, number>()
    for (const collection of COLLECTIONS) {
      const count = await this.reconcile(collection)
      results.set(collection, count)
    }
    return results
  }

  /** getDriftCount
   * Descrição: Retorna número de falhas de escrita no target
   */
  getDriftCount(): number {
    return this.driftCount
  }

  /** resetDriftCount
   * Descrição: Reseta o contador de drift após reconciliação
   */
  resetDriftCount(): void {
    this.driftCount = 0
  }
}
