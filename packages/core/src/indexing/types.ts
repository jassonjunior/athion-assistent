/**
 * Tipos do módulo de indexação de codebase.
 *
 * CodebaseIndexer = FileWalker + Chunker + EmbeddingService + VectorStore + FtsStore
 *
 * Estratégia:
 *  1. Walker percorre o workspace respeitando .gitignore
 *  2. Chunker divide cada arquivo em chunks semânticos (função, classe, bloco)
 *  3. EmbeddingService chama /v1/embeddings (OpenAI-compatible) para vetores
 *  4. VectorStore salva vetores em SQLite com cosine similarity em JS
 *  5. FtsStore usa SQLite FTS5 para busca por palavras
 *
 * Busca híbrida: vector search re-ranked + FTS fallback
 */

/** Tipo de chunk identificado pelo chunker. */
export type ChunkType = 'function' | 'class' | 'method' | 'block' | 'file'

/**
 * Unidade mínima de código indexada.
 * Cada chunk representa um trecho semântico de um arquivo.
 */
export interface CodeChunk {
  /** ID único do chunk (sha256 de filePath:startLine) */
  id: string
  /** Caminho absoluto do arquivo */
  filePath: string
  /** Extensão normalizada (ts, py, js, etc.) */
  language: string
  /** Linha de início no arquivo (0-based) */
  startLine: number
  /** Linha de fim no arquivo (0-based, inclusive) */
  endLine: number
  /** Conteúdo do chunk (pode ser truncado em >2K chars) */
  content: string
  /** Nome do símbolo detectado (função, classe, etc.) */
  symbolName?: string
  /** Tipo do chunk */
  chunkType: ChunkType
}

/**
 * Resultado de uma busca no índice.
 * score = 1.0 é match perfeito; < 0.3 é relevância baixa.
 */
export interface SearchResult {
  chunk: CodeChunk
  /** Score de similaridade 0-1 */
  score: number
  /** Origem do resultado */
  source: 'vector' | 'fts' | 'hybrid'
}

/** Configuração do indexador. */
export interface IndexerConfig {
  /** Caminho do workspace a indexar */
  workspacePath: string
  /** Caminho do banco SQLite do índice (ex: ~/.athion/index.db) */
  dbPath: string
  /** URL base da API de embeddings (OpenAI-compatible) */
  embeddingBaseUrl?: string
  /** Modelo de embeddings a usar */
  embeddingModel?: string
  /** Máx de linhas por chunk (default: 60) */
  maxChunkLines?: number
  /** Mín de linhas por chunk (default: 3) */
  minChunkLines?: number
  /** Diretórios adicionais a ignorar além dos padrões */
  ignoredDirs?: string[]
}

/** Estatísticas do índice atual. */
export interface IndexStats {
  /** Total de arquivos indexados */
  totalFiles: number
  /** Total de chunks no índice */
  totalChunks: number
  /** Data da última indexação (null se nunca indexado) */
  indexedAt: Date | null
  /** Caminho do workspace */
  workspacePath: string
  /** Se o índice tem vetores (false se embeddings não configurado) */
  hasVectors: boolean
}
