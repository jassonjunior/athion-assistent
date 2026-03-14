/** @module adapters
 * Descrição: Barrel file dos adapters do módulo de indexação.
 * Re-exporta as implementações concretas dos ports.
 */

export { SqliteVectorStore } from './sqlite-vector-store'
export { SqliteTextSearch } from './sqlite-text-search'
export { ProviderEnricher } from './provider-enricher'
export { NoopEnricher } from './noop-enricher'
export { QdrantVectorStore } from './qdrant-vector-store'
export type { QdrantVectorStoreConfig } from './qdrant-vector-store'
