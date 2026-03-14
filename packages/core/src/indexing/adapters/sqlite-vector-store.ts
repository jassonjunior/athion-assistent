/** SqliteVectorStore
 * Descrição: Implementação do VectorStorePort usando SQLite com bun:sqlite.
 * Armazena vetores como BLOB (float32 little-endian) e faz busca por
 * similaridade de cosseno via brute-force O(n). Adequado para índices
 * com menos de ~50K vetores. Para índices maiores, usar QdrantVectorStore.
 */

import { Database } from 'bun:sqlite'
import { cosineSimilarity, deserializeVector, serializeVector } from '../embeddings'
import type {
  FieldCondition,
  VectorFilter,
  VectorPoint,
  VectorSearchQuery,
  VectorSearchResult,
  VectorStorePort,
} from '../ports/vector-store.port'

/** SqliteVectorStore
 * Descrição: Adapter SQLite para armazenamento e busca de vetores de embedding.
 * Implementa VectorStorePort com cosine similarity brute-force.
 */
export class SqliteVectorStore implements VectorStorePort {
  /** db
   * Descrição: Instância do banco de dados SQLite
   */
  private db: Database

  /** initialized
   * Descrição: Flag indicando se o schema já foi criado
   */
  private initialized = false

  /** constructor
   * Descrição: Cria o store apontando para um arquivo SQLite
   * @param dbPath - Caminho do arquivo SQLite
   */
  constructor(private readonly dbPath: string) {
    this.db = new Database(dbPath, { create: true })
    this.db.run('PRAGMA journal_mode = WAL')
    this.db.run('PRAGMA synchronous = NORMAL')
    this.db.run('PRAGMA foreign_keys = ON')
  }

  /** initialize
   * Descrição: Cria a tabela de vetores se não existir
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

    this.db.run(`
      CREATE TABLE IF NOT EXISTS vectors (
        chunk_id TEXT PRIMARY KEY,
        vector BLOB NOT NULL,
        payload TEXT NOT NULL DEFAULT '{}'
      )
    `)

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_vectors_chunk_id ON vectors(chunk_id)
    `)

    this.initialized = true
  }

  /** isAvailable
   * Descrição: Verifica se o banco SQLite está acessível
   * @returns true se o banco responde a queries
   */
  async isAvailable(): Promise<boolean> {
    try {
      this.db.query('SELECT 1').get()
      return true
    } catch {
      return false
    }
  }

  /** upsertPoints
   * Descrição: Insere ou atualiza pontos vetoriais no SQLite.
   * O vetor é serializado como float32 little-endian BLOB.
   * @param _collection - Nome da collection (ignorado no SQLite — tabela única)
   * @param points - Array de pontos vetoriais a inserir/atualizar
   */
  async upsertPoints(_collection: string, points: VectorPoint[]): Promise<void> {
    const stmt = this.db.prepare(
      `INSERT OR REPLACE INTO vectors (chunk_id, vector, payload) VALUES (?, ?, ?)`,
    )

    const transaction = this.db.transaction(() => {
      for (const point of points) {
        stmt.run(point.id, serializeVector(point.vector), JSON.stringify(point.payload))
      }
    })

    transaction()
  }

  /** deletePoints
   * Descrição: Remove pontos vetoriais que satisfazem o filtro.
   * Carrega todos os vetores e filtra em JS (necessário pois payload é JSON).
   * @param _collection - Nome da collection (ignorado no SQLite)
   * @param filter - Filtro sobre campos do payload
   */
  async deletePoints(_collection: string, filter: VectorFilter): Promise<void> {
    if (!filter.must || filter.must.length === 0) return

    // Carrega todos e filtra em JS (payload é JSON no SQLite)
    const rows = this.db
      .query<{ chunk_id: string; payload: string }, []>(`SELECT chunk_id, payload FROM vectors`)
      .all()

    const idsToDelete: string[] = []
    for (const row of rows) {
      const payload = JSON.parse(row.payload) as Record<string, unknown>
      if (matchesFilter(payload, filter)) {
        idsToDelete.push(row.chunk_id)
      }
    }

    if (idsToDelete.length === 0) return

    const placeholders = idsToDelete.map(() => '?').join(',')
    this.db.run(`DELETE FROM vectors WHERE chunk_id IN (${placeholders})`, idsToDelete)
  }

  /** search
   * Descrição: Busca brute-force por similaridade de cosseno.
   * Carrega todos os vetores, calcula similaridade e retorna top-K.
   * @param _collection - Nome da collection (ignorado no SQLite)
   * @param query - Parâmetros da busca vetorial
   * @returns Array de resultados ordenados por score decrescente
   */
  async search(_collection: string, query: VectorSearchQuery): Promise<VectorSearchResult[]> {
    const threshold = query.scoreThreshold ?? 0.1
    const rows = this.db
      .query<
        { chunk_id: string; vector: Buffer; payload: string },
        []
      >(`SELECT chunk_id, vector, payload FROM vectors`)
      .all()

    const scored: VectorSearchResult[] = []
    for (const row of rows) {
      const payload = JSON.parse(row.payload) as Record<string, unknown>

      // Aplica filtro se presente
      if (query.filter && !matchesFilter(payload, query.filter)) continue

      const vec = deserializeVector(row.vector)
      const score = cosineSimilarity(query.vector, vec)

      if (score > threshold) {
        scored.push({ id: row.chunk_id, score, payload })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, query.limit)
  }

  /** retrieve
   * Descrição: Recupera pontos vetoriais por seus IDs
   * @param _collection - Nome da collection (ignorado no SQLite)
   * @param ids - Array de IDs dos pontos a recuperar
   * @returns Array de pontos encontrados
   */
  async retrieve(_collection: string, ids: string[]): Promise<VectorPoint[]> {
    if (ids.length === 0) return []

    const placeholders = ids.map(() => '?').join(',')
    const rows = this.db
      .query<
        { chunk_id: string; vector: Buffer; payload: string },
        string[]
      >(`SELECT chunk_id, vector, payload FROM vectors WHERE chunk_id IN (${placeholders})`)
      .all(...ids)

    return rows.map((row) => ({
      id: row.chunk_id,
      vector: deserializeVector(row.vector),
      payload: JSON.parse(row.payload) as Record<string, unknown>,
    }))
  }

  /** scroll
   * Descrição: Percorre todos os pontos da tabela com filtro opcional
   * @param _collection - Nome da collection (ignorado no SQLite)
   * @param filter - Filtro opcional sobre campos do payload
   * @param limit - Número máximo de pontos a retornar (default: 1000)
   * @returns Array de pontos vetoriais
   */
  async scroll(_collection: string, filter?: VectorFilter, limit = 1000): Promise<VectorPoint[]> {
    const rows = this.db
      .query<
        { chunk_id: string; vector: Buffer; payload: string },
        []
      >(`SELECT chunk_id, vector, payload FROM vectors`)
      .all()

    const results: VectorPoint[] = []
    for (const row of rows) {
      const payload = JSON.parse(row.payload) as Record<string, unknown>
      if (filter && !matchesFilter(payload, filter)) continue

      results.push({
        id: row.chunk_id,
        vector: deserializeVector(row.vector),
        payload,
      })

      if (results.length >= limit) break
    }

    return results
  }

  /** close
   * Descrição: Fecha a conexão com o banco de dados SQLite
   */
  async close(): Promise<void> {
    this.db.close()
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** matchesFilter
 * Descrição: Verifica se um payload satisfaz todas as condições do filtro (AND lógico)
 * @param payload - Objeto de metadados a verificar
 * @param filter - Filtro com condições a satisfazer
 * @returns true se todas as condições são satisfeitas
 */
function matchesFilter(payload: Record<string, unknown>, filter: VectorFilter): boolean {
  if (!filter.must || filter.must.length === 0) return true
  return filter.must.every((condition: FieldCondition) => {
    return payload[condition.key] === condition.match.value
  })
}
