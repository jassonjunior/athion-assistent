/** indexing/index
 * Descrição: Barrel file do módulo de indexação de codebase. Re-exporta todos
 * os tipos, classes e funções públicos do sistema de indexação do Athion.
 */
export type { CodeChunk, ChunkType, SearchResult, IndexerConfig, IndexStats } from './types'
export { CodebaseIndexer, createCodebaseIndexer } from './manager'
export type { CodebaseIndexerDeps } from './manager'
export { walkDirectory, detectLanguage, CODE_EXTENSIONS } from './file-walker'
export { chunkFile, generateChunkId } from './chunker'
export {
  createEmbeddingService,
  cosineSimilarity,
  serializeVector,
  deserializeVector,
} from './embeddings'
export type { EmbeddingService, EmbeddingConfig } from './embeddings'

// Ports (interfaces)
export type {
  VectorStorePort,
  VectorPoint,
  VectorSearchQuery,
  VectorSearchResult,
  VectorFilter,
  FieldCondition,
} from './ports'
export type { TextSearchPort, TextDocument, TextSearchResult } from './ports'

// Adapters (implementações concretas)
export { SqliteVectorStore } from './adapters'
export { SqliteTextSearch } from './adapters'

// Result type
export { Ok, Err, unwrapOr, mapResult, flatMapResult, tryCatch, tryCatchAsync } from './result'
export type { Result } from './result'
