/** TextSearchPort
 * Descrição: Interface (port) para busca full-text de código.
 * Abstrai o mecanismo de busca textual — a implementação default usa
 * SQLite FTS5 com tokenizer trigram, mas pode ser trocada por Elasticsearch,
 * Meilisearch, etc. sem afetar o domínio.
 */

/** TextDocument
 * Descrição: Documento a ser indexado para busca full-text
 */
export interface TextDocument {
  /** id
   * Descrição: Identificador único do documento (mesmo ID do chunk)
   */
  id: string
  /** content
   * Descrição: Conteúdo textual do documento (código fonte)
   */
  content: string
  /** symbolName
   * Descrição: Nome do símbolo detectado (função, classe, etc.)
   */
  symbolName?: string
  /** filePath
   * Descrição: Caminho absoluto do arquivo fonte
   */
  filePath: string
  /** language
   * Descrição: Linguagem de programação (ex: 'typescript', 'python')
   */
  language: string
}

/** TextSearchResult
 * Descrição: Resultado de uma busca full-text com score de relevância
 */
export interface TextSearchResult {
  /** id
   * Descrição: ID do documento encontrado
   */
  id: string
  /** filePath
   * Descrição: Caminho do arquivo fonte do documento
   */
  filePath: string
  /** score
   * Descrição: Score de relevância normalizado entre 0 e 1 (1 = mais relevante)
   */
  score: number
}

/** TextSearchPort
 * Descrição: Interface abstrata para indexação e busca full-text de código.
 * Implementada por SqliteTextSearch (FTS5) e futuramente por outros backends.
 */
export interface TextSearchPort {
  /** initialize
   * Descrição: Inicializa o store de busca (cria tabelas FTS, etc.)
   */
  initialize(): Promise<void>

  /** indexDocument
   * Descrição: Indexa um documento para busca full-text
   * @param doc - Documento com conteúdo, nome de símbolo e metadados
   */
  indexDocument(doc: TextDocument): Promise<void>

  /** removeDocuments
   * Descrição: Remove documentos do índice por filePath ou IDs
   * @param filter - Critério de remoção (filePath e/ou IDs específicos)
   */
  removeDocuments(filter: { filePath?: string; ids?: string[] }): Promise<void>

  /** search
   * Descrição: Busca full-text nos documentos indexados
   * @param query - Texto de busca
   * @param limit - Número máximo de resultados (default: 20)
   * @returns Array de resultados ordenados por relevância
   */
  search(query: string, limit?: number): Promise<TextSearchResult[]>

  /** close
   * Descrição: Fecha a conexão e libera recursos do store
   */
  close(): Promise<void>
}
