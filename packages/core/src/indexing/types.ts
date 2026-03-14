/** Tipos do módulo de indexação de codebase
 * Descrição: Define os tipos principais para o sistema de indexação do Athion.
 * CodebaseIndexer = FileWalker + Chunker + EmbeddingService + VectorStore + FtsStore.
 * Estratégia: walker percorre o workspace, chunker divide em blocos semânticos,
 * embeddings gera vetores, VectorStore salva em SQLite com cosine similarity,
 * FtsStore usa SQLite FTS5 para busca por palavras.
 */

/** ChunkType
 * Descrição: Tipo de chunk identificado pelo chunker (função, classe, método, bloco ou arquivo inteiro)
 */
export type ChunkType = 'function' | 'class' | 'method' | 'block' | 'file'

/** CodeChunk
 * Descrição: Unidade mínima de código indexada. Cada chunk representa
 * um trecho semântico de um arquivo.
 */
export interface CodeChunk {
  /** id
   * Descrição: ID único do chunk (sha256 de filePath:startLine:endLine)
   */
  id: string
  /** filePath
   * Descrição: Caminho absoluto do arquivo fonte
   */
  filePath: string
  /** language
   * Descrição: Extensão normalizada da linguagem (ts, py, js, etc.)
   */
  language: string
  /** startLine
   * Descrição: Linha de início no arquivo (0-based)
   */
  startLine: number
  /** endLine
   * Descrição: Linha de fim no arquivo (0-based, inclusive)
   */
  endLine: number
  /** content
   * Descrição: Conteúdo do chunk (pode ser truncado em >2K chars)
   */
  content: string
  /** symbolName
   * Descrição: Nome do símbolo detectado (função, classe, etc.)
   */
  symbolName?: string
  /** chunkType
   * Descrição: Tipo do chunk (function, class, method, block, file)
   */
  chunkType: ChunkType
}

/** SearchResult
 * Descrição: Resultado de uma busca no índice. score = 1.0 é match perfeito;
 * abaixo de 0.3 é relevância baixa.
 */
export interface SearchResult {
  /** chunk
   * Descrição: O chunk de código encontrado
   */
  chunk: CodeChunk
  /** score
   * Descrição: Score de similaridade entre 0 e 1
   */
  score: number
  /** source
   * Descrição: Origem do resultado ('vector', 'fts' ou 'hybrid')
   */
  source: 'vector' | 'fts' | 'hybrid'
}

/** IndexerConfig
 * Descrição: Configuração do indexador de codebase
 */
export interface IndexerConfig {
  /** workspacePath
   * Descrição: Caminho do workspace a indexar
   */
  workspacePath: string
  /** dbPath
   * Descrição: Caminho do banco SQLite do índice (ex: ~/.athion/index.db)
   */
  dbPath: string
  /** embeddingBaseUrl
   * Descrição: URL base da API de embeddings OpenAI-compatible (opcional)
   */
  embeddingBaseUrl?: string
  /** embeddingModel
   * Descrição: Modelo de embeddings a usar (default: 'nomic-embed-text')
   */
  embeddingModel?: string
  /** maxChunkLines
   * Descrição: Máximo de linhas por chunk (default: 60)
   */
  maxChunkLines?: number
  /** minChunkLines
   * Descrição: Mínimo de linhas por chunk (default: 3)
   */
  minChunkLines?: number
  /** ignoredDirs
   * Descrição: Diretórios adicionais a ignorar além dos padrões
   */
  ignoredDirs?: string[]
}

/** IndexStats
 * Descrição: Estatísticas do índice atual
 */
export interface IndexStats {
  /** totalFiles
   * Descrição: Total de arquivos indexados
   */
  totalFiles: number
  /** totalChunks
   * Descrição: Total de chunks no índice
   */
  totalChunks: number
  /** indexedAt
   * Descrição: Data da última indexação (null se nunca indexado)
   */
  indexedAt: Date | null
  /** workspacePath
   * Descrição: Caminho do workspace indexado
   */
  workspacePath: string
  /** hasVectors
   * Descrição: Se o índice contém vetores de embedding (false se embeddings não configurado)
   */
  hasVectors: boolean
}
