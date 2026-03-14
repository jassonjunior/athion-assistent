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

// Ports — LLM Enricher
export type {
  LlmEnricherPort,
  EnrichmentError,
  RepoMeta,
  FileSummary,
  ModuleSummary,
  PatternAnalysis,
} from './ports'

// Adapters (implementações concretas)
export { SqliteVectorStore } from './adapters'
export { SqliteTextSearch } from './adapters'
export { ProviderEnricher } from './adapters'
export { NoopEnricher } from './adapters'

// Qdrant adapter
export { QdrantVectorStore } from './adapters'
export type { QdrantVectorStoreConfig } from './adapters'

// Vector Store Chain + Dual Write
export { VectorStoreChain } from './vector-store-chain'
export { DualWriteManager } from './dual-write-manager'

// Pipeline
export { IndexPipeline, createStage, stageOk, stageErr } from './pipeline'
export type { PipelineStage, PipelineResult, PipelineError, StageResult } from './pipeline'

// LLM Priority Queue
export { LlmPriorityQueue } from './llm-priority-queue'

// Dependency Graph
export { DependencyGraph } from './dependency-graph'
export type { ImpactResult, GraphStats, SerializedGraph } from './dependency-graph'

// Context Builder + Formatters
export { ContextAssembler, estimateTokens, truncateBlock } from './context-builder'
export type { ContextBlock, AssembledContext } from './context-builder'
export {
  formatRepoMeta,
  formatPatterns,
  formatFileSummaries,
  formatSymbols,
  formatImpactAnalysis,
  formatHierarchicalPrompt,
} from './context-formatters'
export type {
  RepoMetaData,
  PatternData,
  FileSummaryData,
  SymbolData,
  ImpactData,
} from './context-formatters'

// Retrieval Cache
export { RetrievalCache } from './retrieval-cache'

// Watcher + Queue + Metrics
export { CodebaseWatcher } from './watcher'
export type { CodebaseWatcherConfig } from './watcher'
export { IndexQueue } from './index-queue'
export type { IndexTask, IndexQueueConfig } from './index-queue'
export { IndexMetrics } from './index-metrics'
export type { IndexMetricsData } from './index-metrics'

// Events
export {
  fileChangedEvent,
  indexingStartedEvent,
  indexingCompletedEvent,
  indexingFailedEvent,
  indexingProgressEvent,
  metricsUpdatedEvent,
} from './events'

// Result type
export { Ok, Err, unwrapOr, mapResult, flatMapResult, tryCatch, tryCatchAsync } from './result'
export type { Result } from './result'
