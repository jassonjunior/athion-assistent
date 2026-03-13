/** indexing/index
 * Descrição: Barrel file do módulo de indexação de codebase. Re-exporta todos
 * os tipos, classes e funções públicos do sistema de indexação do Athion.
 */
export type { CodeChunk, ChunkType, SearchResult, IndexerConfig, IndexStats } from './types'
export { CodebaseIndexer, createCodebaseIndexer } from './manager'
export { walkDirectory, detectLanguage, CODE_EXTENSIONS } from './file-walker'
export { chunkFile, generateChunkId } from './chunker'
export {
  createEmbeddingService,
  cosineSimilarity,
  serializeVector,
  deserializeVector,
} from './embeddings'
export type { EmbeddingService, EmbeddingConfig } from './embeddings'
