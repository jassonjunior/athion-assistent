/** QdrantVectorStore
 * Descrição: Adapter do VectorStorePort que usa Qdrant como backend vetorial.
 * Implementa HNSW search (vs brute-force SQLite), health check periódico,
 * e criação automática de coleções com Distance.Cosine.
 */

import { QdrantClient } from '@qdrant/js-client-rest'
import type {
  VectorStorePort,
  VectorPoint,
  VectorSearchQuery,
  VectorSearchResult,
  VectorFilter,
} from '../ports/vector-store.port'

/** COLLECTIONS
 * Descrição: Coleções Qdrant para o índice hierárquico 5 níveis
 */
const COLLECTIONS = ['symbols', 'files', 'modules', 'patterns', 'repo_meta'] as const

/** DEFAULT_VECTOR_SIZE
 * Descrição: Dimensão padrão dos vetores (nomic-embed-text = 768)
 */
const DEFAULT_VECTOR_SIZE = 768

/** HEALTH_CHECK_INTERVAL_MS
 * Descrição: Intervalo do health check em milissegundos (30s)
 */
const HEALTH_CHECK_INTERVAL_MS = 30_000

/** QdrantVectorStoreConfig
 * Descrição: Configuração do adapter Qdrant
 */
export interface QdrantVectorStoreConfig {
  /** url - URL do servidor Qdrant (default: http://localhost:6333) */
  url?: string
  /** apiKey - Chave de API opcional */
  apiKey?: string
  /** vectorSize - Dimensão dos vetores (default: 768) */
  vectorSize?: number
}

/** QdrantVectorStore
 * Descrição: Implementação do VectorStorePort usando Qdrant HNSW.
 * Health check a cada 30s atualiza isAvailable().
 */
export class QdrantVectorStore implements VectorStorePort {
  private client: QdrantClient
  private available = false
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null
  private vectorSize: number

  constructor(config: QdrantVectorStoreConfig = {}) {
    this.client = new QdrantClient({
      url: config.url ?? 'http://localhost:6333',
      apiKey: config.apiKey,
      timeout: 10_000,
    })
    this.vectorSize = config.vectorSize ?? DEFAULT_VECTOR_SIZE
  }

  /** initialize
   * Descrição: Inicializa o adapter — cria coleções e inicia health check
   */
  async initialize(): Promise<void> {
    try {
      await this.checkHealth()
      if (this.available) {
        await this.ensureCollections()
      }
      this.startHealthCheck()
    } catch {
      this.available = false
      this.startHealthCheck()
    }
  }

  /** isAvailable
   * Descrição: Retorna se o Qdrant está acessível
   */
  async isAvailable(): Promise<boolean> {
    return this.available
  }

  /** upsertPoints
   * Descrição: Insere ou atualiza pontos vetoriais em uma coleção
   * @param collection - Nome da coleção
   * @param points - Pontos a inserir
   */
  async upsertPoints(collection: string, points: VectorPoint[]): Promise<void> {
    if (!this.available || points.length === 0) return

    const qdrantPoints = points.map((p) => ({
      id: stringToUuid(p.id),
      vector: p.vector,
      payload: { ...p.payload, _original_id: p.id },
    }))

    await this.client.upsert(collection, { wait: true, points: qdrantPoints })
  }

  /** deletePoints
   * Descrição: Remove pontos por filtro de uma coleção
   * @param collection - Nome da coleção
   * @param filter - Filtro para selecionar pontos a remover
   */
  async deletePoints(collection: string, filter: VectorFilter): Promise<void> {
    if (!this.available) return

    const qdrantFilter = mapFilter(filter)
    await this.client.delete(collection, { wait: true, filter: qdrantFilter })
  }

  /** search
   * Descrição: Busca por similaridade vetorial usando HNSW
   * @param collection - Nome da coleção
   * @param query - Parâmetros de busca
   * @returns Array de resultados ordenados por score
   */
  async search(collection: string, query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    if (!this.available) return []

    const results = await this.client.search(collection, {
      vector: query.vector,
      limit: query.limit ?? 10,
      score_threshold: query.scoreThreshold,
      filter: query.filter ? mapFilter(query.filter) : undefined,
      with_payload: true,
    })

    return results.map((r) => {
      const payload = (r.payload ?? {}) as Record<string, unknown>
      const originalId = (payload._original_id as string) ?? String(r.id)
      const { _original_id, ...cleanPayload } = payload
      void _original_id
      return {
        id: originalId,
        score: r.score,
        payload: cleanPayload,
      }
    })
  }

  /** retrieve
   * Descrição: Recupera pontos por IDs
   * @param collection - Nome da coleção
   * @param ids - Array de IDs a recuperar
   * @returns Array de pontos encontrados
   */
  async retrieve(collection: string, ids: string[]): Promise<VectorPoint[]> {
    if (!this.available || ids.length === 0) return []

    const uuids = ids.map(stringToUuid)
    const results = await this.client.retrieve(collection, {
      ids: uuids,
      with_payload: true,
      with_vector: true,
    })

    return results.map((r) => {
      const payload = (r.payload ?? {}) as Record<string, unknown>
      const originalId = (payload._original_id as string) ?? String(r.id)
      const { _original_id, ...cleanPayload } = payload
      void _original_id
      return {
        id: originalId,
        vector: Array.isArray(r.vector) ? (r.vector as number[]) : [],
        payload: cleanPayload,
      }
    })
  }

  /** scroll
   * Descrição: Percorre todos os pontos de uma coleção com paginação
   * @param collection - Nome da coleção
   * @param limit - Tamanho da página
   * @param offset - Offset de paginação (string ou number)
   * @returns Pontos e próximo offset
   */
  async scroll(
    collection: string,
    limit: number,
    offset?: string | number,
  ): Promise<{ points: VectorPoint[]; nextOffset?: string | number }> {
    if (!this.available) return { points: [] }

    const result = await this.client.scroll(collection, {
      limit,
      offset: offset !== null && offset !== undefined ? offset : undefined,
      with_payload: true,
      with_vector: true,
    })

    const points: VectorPoint[] = result.points.map((r) => {
      const payload = (r.payload ?? {}) as Record<string, unknown>
      const originalId = (payload._original_id as string) ?? String(r.id)
      const { _original_id, ...cleanPayload } = payload
      void _original_id
      return {
        id: originalId,
        vector: Array.isArray(r.vector) ? (r.vector as number[]) : [],
        payload: cleanPayload,
      }
    })

    return { points, nextOffset: result.next_page_offset ?? undefined }
  }

  /** close
   * Descrição: Para o health check e fecha o adapter
   */
  async close(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
    this.available = false
  }

  /** checkHealth
   * Descrição: Verifica se o Qdrant está acessível
   */
  private async checkHealth(): Promise<void> {
    try {
      await this.client.getCollections()
      this.available = true
    } catch {
      this.available = false
    }
  }

  /** startHealthCheck
   * Descrição: Inicia verificação periódica de saúde do Qdrant
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) return
    this.healthCheckTimer = setInterval(() => {
      this.checkHealth().catch(() => {
        this.available = false
      })
    }, HEALTH_CHECK_INTERVAL_MS)
  }

  /** ensureCollections
   * Descrição: Garante que todas as coleções existem com configuração correta
   */
  private async ensureCollections(): Promise<void> {
    const existing = await this.client.getCollections()
    const existingNames = new Set(existing.collections.map((c) => c.name))

    for (const name of COLLECTIONS) {
      if (existingNames.has(name)) continue

      await this.client.createCollection(name, {
        vectors: { size: this.vectorSize, distance: 'Cosine' },
        optimizers_config: { indexing_threshold: 100 },
      })

      // Payload indexes para coleção symbols
      if (name === 'symbols') {
        await this.client
          .createPayloadIndex(name, { field_name: 'filePath', field_schema: 'keyword' })
          .catch(() => {})
        await this.client
          .createPayloadIndex(name, { field_name: 'chunkType', field_schema: 'keyword' })
          .catch(() => {})
      }
    }
  }
}

/** stringToUuid
 * Descrição: Converte string ID para UUID v5-like determinístico via MD5
 * @param str - String a converter
 * @returns UUID formatado como xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
function stringToUuid(str: string): string {
  const hasher = new Bun.CryptoHasher('md5')
  hasher.update(str)
  const hex = hasher.digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** mapFilter
 * Descrição: Mapeia VectorFilter do port para formato Qdrant
 * @param filter - Filtro no formato do port
 * @returns Filtro no formato Qdrant
 */
function mapFilter(filter: VectorFilter): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = []

  for (const cond of filter.must ?? []) {
    if (cond.match) {
      conditions.push({
        key: cond.key,
        match: { value: cond.match.value },
      })
    }
    if (cond.range) {
      conditions.push({
        key: cond.key,
        range: cond.range,
      })
    }
  }

  return { must: conditions }
}
