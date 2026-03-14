/** RetrievalCache
 * Descrição: Cache LRU com TTL para resultados de busca no índice.
 * Evita re-computar embeddings e buscas para queries repetidas.
 * Invalidação via pattern matching ou total (Event Bus: codebase:indexing_completed).
 */

/** CacheEntry
 * Descrição: Entrada no cache com valor, timestamp e acesso
 */
interface CacheEntry<T> {
  /** value - Valor armazenado */
  value: T
  /** createdAt - Timestamp de criação (ms) */
  createdAt: number
  /** lastAccess - Timestamp do último acesso (ms) */
  lastAccess: number
}

/** RetrievalCache
 * Descrição: Cache LRU genérico com TTL para resultados de retrieval.
 * Evicts entries menos recentemente usadas quando excede maxSize.
 * TTL expira entries após ttlMs milissegundos.
 */
export class RetrievalCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map()
  private maxSize: number
  private ttlMs: number

  /** constructor
   * Descrição: Cria cache com tamanho e TTL configuráveis
   * @param maxSize - Número máximo de entries (default: 100)
   * @param ttlMs - Time-to-live em milissegundos (default: 60000)
   */
  constructor(maxSize = 100, ttlMs = 60_000) {
    this.maxSize = maxSize
    this.ttlMs = ttlMs
  }

  /** get
   * Descrição: Recupera valor do cache por chave. Retorna undefined se não
   * encontrado ou expirado. Atualiza lastAccess para LRU.
   * @param key - Chave de busca
   * @returns Valor ou undefined se miss/expirado
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    // Verifica TTL
    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key)
      return undefined
    }

    // Atualiza LRU: remove e re-insere no final do Map
    entry.lastAccess = Date.now()
    this.cache.delete(key)
    this.cache.set(key, entry)

    return entry.value
  }

  /** set
   * Descrição: Armazena valor no cache. Evict LRU se exceder maxSize.
   * @param key - Chave
   * @param value - Valor a armazenar
   */
  set(key: string, value: T): void {
    // Remove entry existente (para re-inserir no final)
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }

    // Evict LRU se necessário
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value as string
      this.cache.delete(firstKey)
    }

    const now = Date.now()
    this.cache.set(key, {
      value,
      createdAt: now,
      lastAccess: now,
    })
  }

  /** invalidate
   * Descrição: Remove entries do cache. Se pattern fornecido, remove apenas
   * entries cujas chaves contêm o pattern. Sem pattern, limpa tudo.
   * @param pattern - Substring para match de chaves (opcional)
   */
  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear()
      return
    }

    for (const key of [...this.cache.keys()]) {
      if (key.includes(pattern)) {
        this.cache.delete(key)
      }
    }
  }

  /** size
   * Descrição: Retorna número de entries no cache
   */
  get size(): number {
    return this.cache.size
  }
}
