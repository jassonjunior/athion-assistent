/** VectorStorePort
 * Descrição: Interface (port) para armazenamento e busca de vetores de embedding.
 * Segue o padrão Hexagonal Architecture — qualquer backend (SQLite, Qdrant, etc.)
 * pode implementar esta interface sem afetar o domínio.
 */

/** VectorPoint
 * Descrição: Ponto vetorial com ID, vetor numérico e payload de metadados
 */
export interface VectorPoint {
  /** id
   * Descrição: Identificador único do ponto vetorial
   */
  id: string
  /** vector
   * Descrição: Vetor de embedding como array de números float
   */
  vector: number[]
  /** payload
   * Descrição: Metadados associados ao ponto (filePath, language, etc.)
   */
  payload: Record<string, unknown>
}

/** VectorSearchQuery
 * Descrição: Parâmetros para busca por similaridade vetorial
 */
export interface VectorSearchQuery {
  /** vector
   * Descrição: Vetor de consulta para calcular similaridade
   */
  vector: number[]
  /** limit
   * Descrição: Número máximo de resultados a retornar
   */
  limit: number
  /** filter
   * Descrição: Filtro opcional para restringir a busca por campos do payload
   */
  filter?: VectorFilter
  /** scoreThreshold
   * Descrição: Score mínimo de similaridade para incluir no resultado (default: 0.1)
   */
  scoreThreshold?: number
}

/** VectorSearchResult
 * Descrição: Resultado de uma busca vetorial com score de similaridade
 */
export interface VectorSearchResult {
  /** id
   * Descrição: ID do ponto vetorial encontrado
   */
  id: string
  /** score
   * Descrição: Score de similaridade (0-1, onde 1 = idêntico)
   */
  score: number
  /** payload
   * Descrição: Metadados do ponto encontrado
   */
  payload: Record<string, unknown>
}

/** VectorFilter
 * Descrição: Filtro composto por condições AND sobre campos do payload
 */
export interface VectorFilter {
  /** must
   * Descrição: Array de condições que devem ser todas satisfeitas (AND lógico)
   */
  must?: FieldCondition[]
}

/** FieldCondition
 * Descrição: Condição de filtro sobre um campo específico do payload
 */
export interface FieldCondition {
  /** key
   * Descrição: Nome do campo no payload a filtrar
   */
  key: string
  /** match
   * Descrição: Valor que o campo deve ter para satisfazer a condição
   */
  match: { value: string | number | boolean }
}

/** VectorStorePort
 * Descrição: Interface abstrata para operações de armazenamento e busca vetorial.
 * Implementada por SqliteVectorStore (brute-force) e futuramente por QdrantVectorStore (HNSW).
 */
export interface VectorStorePort {
  /** initialize
   * Descrição: Inicializa o store (cria tabelas, conecta ao servidor, etc.)
   * @returns Promise que resolve quando o store está pronto
   */
  initialize(): Promise<void>

  /** isAvailable
   * Descrição: Verifica se o store está disponível e acessível
   * @returns true se o store está pronto para operações
   */
  isAvailable(): Promise<boolean>

  /** upsertPoints
   * Descrição: Insere ou atualiza pontos vetoriais em uma collection
   * @param collection - Nome da collection de vetores
   * @param points - Array de pontos vetoriais a inserir/atualizar
   */
  upsertPoints(collection: string, points: VectorPoint[]): Promise<void>

  /** deletePoints
   * Descrição: Remove pontos vetoriais que satisfazem o filtro
   * @param collection - Nome da collection
   * @param filter - Filtro para selecionar os pontos a remover
   */
  deletePoints(collection: string, filter: VectorFilter): Promise<void>

  /** search
   * Descrição: Busca os pontos mais similares ao vetor de consulta
   * @param collection - Nome da collection
   * @param query - Parâmetros da busca (vetor, limit, filtro, threshold)
   * @returns Array de resultados ordenados por score decrescente
   */
  search(collection: string, query: VectorSearchQuery): Promise<VectorSearchResult[]>

  /** retrieve
   * Descrição: Recupera pontos vetoriais por seus IDs
   * @param collection - Nome da collection
   * @param ids - Array de IDs dos pontos a recuperar
   * @returns Array de pontos encontrados (pode ter menos itens que ids)
   */
  retrieve(collection: string, ids: string[]): Promise<VectorPoint[]>

  /** scroll
   * Descrição: Percorre todos os pontos de uma collection com filtro opcional
   * @param collection - Nome da collection
   * @param filter - Filtro opcional para restringir resultados
   * @param limit - Número máximo de pontos a retornar
   * @returns Array de pontos vetoriais
   */
  scroll(collection: string, filter?: VectorFilter, limit?: number): Promise<VectorPoint[]>

  /** close
   * Descrição: Fecha a conexão e libera recursos do store
   */
  close(): Promise<void>
}
