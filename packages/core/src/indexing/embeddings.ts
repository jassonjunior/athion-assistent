/** EmbeddingService
 * Descrição: Gera vetores de texto via API OpenAI-compatible.
 * Chama POST /v1/embeddings com os textos e retorna float[] por texto.
 * Compatível com LM Studio, Ollama (com embeddings) e OpenAI.
 * Se o endpoint não estiver disponível, retorna null e o indexador
 * funciona em modo FTS-only (sem busca por similaridade semântica).
 */

/** EmbeddingConfig
 * Descrição: Configuração do serviço de embeddings
 */
export interface EmbeddingConfig {
  /** baseUrl
   * Descrição: URL base da API de embeddings (ex: 'http://localhost:1234')
   */
  baseUrl: string
  /** model
   * Descrição: Modelo de embeddings a usar (ex: 'text-embedding-ada-002', 'nomic-embed-text')
   */
  model: string
  /** dimensions
   * Descrição: Dimensões esperadas dos vetores (para validação, opcional)
   */
  dimensions?: number
  /** apiKey
   * Descrição: API key para autenticação (opcional, ex: LM Studio com auth habilitado)
   */
  apiKey?: string
}

/** EmbeddingService
 * Descrição: Interface do serviço de embeddings para geração de vetores
 */
export interface EmbeddingService {
  /** embed
   * Descrição: Gera embedding para um único texto
   * @param text - Texto para gerar embedding
   * @returns Vetor de números ou null se falhar
   */
  embed(text: string): Promise<number[] | null>
  /** embedBatch
   * Descrição: Gera embeddings em batch (mais eficiente que chamar embed individualmente)
   * @param texts - Array de textos para gerar embeddings
   * @returns Array de vetores ou null se falhar
   */
  embedBatch(texts: string[]): Promise<number[][] | null>
  /** getDimensions
   * Descrição: Retorna a dimensão dos vetores gerados
   * @returns Número de dimensões (0 se desconhecida/não inicializada)
   */
  getDimensions(): number
}

/** createEmbeddingService
 * Descrição: Cria uma instância do serviço de embeddings que chama API OpenAI-compatible
 * @param config - Configuração com URL base, modelo e dimensões opcionais
 * @returns Instância do EmbeddingService
 */
export function createEmbeddingService(config: EmbeddingConfig): EmbeddingService {
  let dimensions = config.dimensions ?? 0

  /** embedBatch
   * Descrição: Gera embeddings para múltiplos textos em uma única chamada à API
   * @param texts - Array de textos para gerar embeddings
   * @returns Array de vetores ordenados por índice original ou null se falhar
   */
  async function embedBatch(texts: string[]): Promise<number[][] | null> {
    if (texts.length === 0) return []
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`
      }

      const response = await fetch(`${config.baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ model: config.model, input: texts }),
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) return null

      const data = (await response.json()) as {
        data: Array<{ embedding: number[]; index: number }>
      }

      // Ordena por index (a API pode retornar fora de ordem)
      const sorted = data.data.sort((a, b) => a.index - b.index)
      const vectors = sorted.map((item) => item.embedding)

      if (vectors[0] && dimensions === 0) {
        dimensions = vectors[0].length
      }

      return vectors
    } catch {
      return null
    }
  }

  /** embed
   * Descrição: Gera embedding para um único texto (wrapper sobre embedBatch)
   * @param text - Texto para gerar embedding
   * @returns Vetor de números ou null se falhar
   */
  async function embed(text: string): Promise<number[] | null> {
    const result = await embedBatch([text])
    return result?.[0] ?? null
  }

  /** getDimensions
   * Descrição: Retorna a dimensão dos vetores (inferida na primeira chamada)
   * @returns Número de dimensões
   */
  function getDimensions(): number {
    return dimensions
  }

  return { embed, embedBatch, getDimensions }
}

/** cosineSimilarity
 * Descrição: Calcula a similaridade de cosseno entre dois vetores.
 * Retorna valor entre -1 e 1 (1 = idêntico, 0 = ortogonal, -1 = oposto).
 * @param a - Primeiro vetor
 * @param b - Segundo vetor
 * @returns Valor de similaridade entre -1 e 1
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0
    const bi = b[i] ?? 0
    dotProduct += ai * bi
    normA += ai * ai
    normB += bi * bi
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0
  return dotProduct / denominator
}

/** serializeVector
 * Descrição: Serializa vetor float[] para Buffer em formato little-endian float32
 * @param vec - Vetor de números a serializar
 * @returns Buffer com os floats serializados
 */
export function serializeVector(vec: number[]): Buffer {
  const buf = Buffer.allocUnsafe(vec.length * 4)
  for (let i = 0; i < vec.length; i++) {
    buf.writeFloatLE(vec[i] ?? 0, i * 4)
  }
  return buf
}

/** deserializeVector
 * Descrição: Desserializa Buffer/Uint8Array de volta para array de floats
 * @param buf - Buffer contendo floats serializados em little-endian
 * @returns Array de números reconstruído
 */
export function deserializeVector(buf: Buffer | Uint8Array): number[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const len = Math.floor(buf.byteLength / 4)
  const vec: number[] = new Array(len)
  for (let i = 0; i < len; i++) {
    vec[i] = view.getFloat32(i * 4, true) // little-endian
  }
  return vec
}
