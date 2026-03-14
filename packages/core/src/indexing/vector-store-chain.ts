/** VectorStoreChain
 * Descrição: Strategy + Chain que tenta o store primário (Qdrant) primeiro,
 * e faz fallback para o store secundário (SQLite) se falhar.
 * Writes vão sempre para ambos (dual-write com best-effort no primary).
 */

import type {
  VectorStorePort,
  VectorPoint,
  VectorSearchQuery,
  VectorSearchResult,
  VectorFilter,
} from './ports/vector-store.port'

/** VectorStoreChain
 * Descrição: Chain de vector stores com fallback automático.
 * Primary = Qdrant (rápido), Fallback = SQLite (sempre disponível).
 */
export class VectorStoreChain implements VectorStorePort {
  private primaryAvailable = false

  /** activeStoreName
   * Descrição: Nome do store atualmente ativo para logging
   */
  activeStoreName = 'fallback'

  constructor(
    private primary: VectorStorePort,
    private fallback: VectorStorePort,
  ) {}

  /** initialize
   * Descrição: Inicializa ambos os stores
   */
  async initialize(): Promise<void> {
    await this.fallback.initialize()
    try {
      await this.primary.initialize()
      this.primaryAvailable = await this.primary.isAvailable()
      this.activeStoreName = this.primaryAvailable ? 'primary' : 'fallback'
    } catch {
      this.primaryAvailable = false
      this.activeStoreName = 'fallback'
    }
  }

  /** isAvailable
   * Descrição: Sempre disponível (fallback garante)
   */
  async isAvailable(): Promise<boolean> {
    return true
  }

  /** upsertPoints
   * Descrição: Escreve no fallback (fonte de verdade) e best-effort no primary
   */
  async upsertPoints(collection: string, points: VectorPoint[]): Promise<void> {
    await this.fallback.upsertPoints(collection, points)

    if (this.primaryAvailable) {
      try {
        await this.primary.upsertPoints(collection, points)
      } catch {
        await this.refreshPrimaryStatus()
      }
    }
  }

  /** deletePoints
   * Descrição: Remove de ambos os stores
   */
  async deletePoints(collection: string, filter: VectorFilter): Promise<void> {
    await this.fallback.deletePoints(collection, filter)

    if (this.primaryAvailable) {
      try {
        await this.primary.deletePoints(collection, filter)
      } catch {
        await this.refreshPrimaryStatus()
      }
    }
  }

  /** search
   * Descrição: Tenta primary primeiro, fallback se falhar
   */
  async search(collection: string, query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    if (this.primaryAvailable) {
      try {
        return await this.primary.search(collection, query)
      } catch {
        await this.refreshPrimaryStatus()
      }
    }
    return this.fallback.search(collection, query)
  }

  /** retrieve
   * Descrição: Tenta primary primeiro, fallback se falhar
   */
  async retrieve(collection: string, ids: string[]): Promise<VectorPoint[]> {
    if (this.primaryAvailable) {
      try {
        return await this.primary.retrieve(collection, ids)
      } catch {
        await this.refreshPrimaryStatus()
      }
    }
    return this.fallback.retrieve(collection, ids)
  }

  /** scroll
   * Descrição: Tenta primary primeiro, fallback se falhar
   */
  async scroll(
    collection: string,
    limit: number,
    offset?: string | number,
  ): Promise<{ points: VectorPoint[]; nextOffset?: string | number }> {
    if (this.primaryAvailable) {
      try {
        return await this.primary.scroll(collection, limit, offset)
      } catch {
        await this.refreshPrimaryStatus()
      }
    }
    return this.fallback.scroll(collection, limit, offset)
  }

  /** close
   * Descrição: Fecha ambos os stores
   */
  async close(): Promise<void> {
    await this.primary.close()
    await this.fallback.close()
  }

  /** refreshPrimaryStatus
   * Descrição: Atualiza status do primary após falha
   */
  private async refreshPrimaryStatus(): Promise<void> {
    this.primaryAvailable = await this.primary.isAvailable().catch(() => false)
    this.activeStoreName = this.primaryAvailable ? 'primary' : 'fallback'
  }
}
