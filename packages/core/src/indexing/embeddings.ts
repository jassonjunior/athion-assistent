/**
 * EmbeddingService — gera vetores de texto via API OpenAI-compatible.
 *
 * Chama POST /v1/embeddings com os textos e retorna float[] por texto.
 * Compatível com LM Studio, Ollama (with embeddings) e OpenAI.
 *
 * Se o endpoint não estiver disponível, retorna null e o indexador
 * funciona em modo FTS-only (sem busca por similaridade semântica).
 */

export interface EmbeddingConfig {
  /** URL base da API (ex: 'http://localhost:1234') */
  baseUrl: string
  /** Modelo de embeddings (ex: 'text-embedding-ada-002', 'nomic-embed-text') */
  model: string
  /** Dimensões esperadas (para validação, opcional) */
  dimensions?: number
}

export interface EmbeddingService {
  /** Gera embedding para um único texto. Retorna null se falhar. */
  embed(text: string): Promise<number[] | null>
  /** Gera embeddings em batch (mais eficiente). Retorna null se falhar. */
  embedBatch(texts: string[]): Promise<number[][] | null>
  /** Retorna dimensão dos vetores (0 se desconhecida). */
  getDimensions(): number
}

/** Cria uma instância do serviço de embeddings. */
export function createEmbeddingService(config: EmbeddingConfig): EmbeddingService {
  let dimensions = config.dimensions ?? 0

  async function embedBatch(texts: string[]): Promise<number[][] | null> {
    if (texts.length === 0) return []
    try {
      const response = await fetch(`${config.baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  async function embed(text: string): Promise<number[] | null> {
    const result = await embedBatch([text])
    return result?.[0] ?? null
  }

  function getDimensions(): number {
    return dimensions
  }

  return { embed, embedBatch, getDimensions }
}

/**
 * Calcula cosine similarity entre dois vetores.
 * Retorna valor entre -1 e 1 (1 = idêntico, 0 = ortogonal, -1 = oposto).
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

/** Serializa vetor float[] para Buffer (little-endian float32). */
export function serializeVector(vec: number[]): Buffer {
  const buf = Buffer.allocUnsafe(vec.length * 4)
  for (let i = 0; i < vec.length; i++) {
    buf.writeFloatLE(vec[i] ?? 0, i * 4)
  }
  return buf
}

/** Desserializa Buffer/Uint8Array de volta para float[]. */
export function deserializeVector(buf: Buffer | Uint8Array): number[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const len = Math.floor(buf.byteLength / 4)
  const vec: number[] = new Array(len)
  for (let i = 0; i < len; i++) {
    vec[i] = view.getFloat32(i * 4, true) // little-endian
  }
  return vec
}
