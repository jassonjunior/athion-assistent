/** CodebaseIndexer
 * Descrição: Orquestra a indexação e busca do codebase.
 * Fluxo de indexação: walkDirectory -> chunkFile -> embedBatch -> upsert no SQLite.
 * Fluxo de busca: FTS (palavras-chave) + Vector (similaridade semântica) = Hybrid.
 * Suporta atualização incremental (indexFile) e remoção (deleteFile).
 */

import { statSync } from 'node:fs'
import { DbStore } from './db-store'
import { chunkFile, generateChunkId } from './chunker'
import {
  cosineSimilarity,
  createEmbeddingService,
  deserializeVector,
  serializeVector,
} from './embeddings'
import type { EmbeddingService } from './embeddings'
import { walkDirectory } from './file-walker'
import type { CodeChunk, IndexerConfig, IndexStats, SearchResult } from './types'

/** CodebaseIndexer
 * Descrição: Classe principal que gerencia a indexação e busca semântica do codebase.
 * Combina FTS5 (busca por palavras) com embeddings (busca vetorial) para
 * busca híbrida de código.
 */
export class CodebaseIndexer {
  /** store
   * Descrição: Instância do banco SQLite para persistência do índice
   */
  private store: DbStore
  /** embedding
   * Descrição: Serviço de embeddings (null se modo FTS-only)
   */
  private embedding: EmbeddingService | null
  /** config
   * Descrição: Configuração completa do indexador com valores padrão preenchidos
   */
  private config: Required<IndexerConfig>

  /** constructor
   * Descrição: Inicializa o indexador com configuração, banco SQLite e serviço de embeddings
   * @param config - Configuração do indexador (workspace, banco, embeddings)
   */
  constructor(config: IndexerConfig) {
    this.config = {
      workspacePath: config.workspacePath,
      dbPath: config.dbPath,
      embeddingBaseUrl: config.embeddingBaseUrl ?? '',
      embeddingModel: config.embeddingModel ?? 'nomic-embed-text',
      maxChunkLines: config.maxChunkLines ?? 60,
      minChunkLines: config.minChunkLines ?? 3,
      ignoredDirs: config.ignoredDirs ?? [],
    }

    this.store = new DbStore(this.config.dbPath)

    // Embedding é opcional — se baseUrl vazia, funciona em modo FTS-only
    this.embedding = this.config.embeddingBaseUrl
      ? createEmbeddingService({
          baseUrl: this.config.embeddingBaseUrl,
          model: this.config.embeddingModel,
        })
      : null
  }

  /** indexWorkspace
   * Descrição: Indexa o workspace completo. Percorre todos os arquivos,
   * divide em chunks e gera embeddings.
   * @param onProgress - Callback opcional para acompanhar progresso (indexed, total, arquivo)
   * @returns Estatísticas do índice após a indexação
   */
  async indexWorkspace(
    onProgress?: (indexed: number, total: number, currentFile: string) => void,
  ): Promise<IndexStats> {
    const files = await walkDirectory(this.config.workspacePath, {
      ignoredDirs: this.config.ignoredDirs,
    })

    let indexed = 0
    for (const filePath of files) {
      onProgress?.(indexed, files.length, filePath)
      await this.indexFile(filePath)
      indexed++
    }

    this.store.setIndexedAt(new Date())
    return this.getStats()
  }

  /** indexFile
   * Descrição: Indexa (ou re-indexa) um único arquivo. Remove chunks antigos antes
   * de inserir os novos. Gera embeddings se o serviço estiver configurado.
   * @param filePath - Caminho absoluto do arquivo a indexar
   */
  async indexFile(filePath: string): Promise<void> {
    // Remove chunks antigos do arquivo antes de re-indexar
    this.store.deleteByFile(filePath)

    const { chunks } = await chunkFile(filePath, {
      maxChunkLines: this.config.maxChunkLines,
      minChunkLines: this.config.minChunkLines,
    })

    if (chunks.length === 0) return

    // Finaliza IDs dos chunks
    const fullChunks: CodeChunk[] = chunks.map((c) => ({
      ...c,
      id: generateChunkId(c.filePath, c.startLine, c.endLine),
    }))

    // Insere chunks no SQLite
    for (const chunk of fullChunks) {
      this.store.upsertChunk(chunk)
    }

    // Gera embeddings em batch (se configurado)
    if (this.embedding) {
      const texts = fullChunks.map((c) => buildEmbeddingText(c))
      const vectors = await this.embedding.embedBatch(texts)
      if (vectors) {
        for (let i = 0; i < fullChunks.length; i++) {
          const chunk = fullChunks[i]
          const vec = vectors[i]
          if (chunk && vec) {
            this.store.upsertVector(chunk.id, serializeVector(vec))
          }
        }
      }
    }
  }

  /** deleteFile
   * Descrição: Remove um arquivo do índice (para quando o arquivo foi deletado)
   * @param filePath - Caminho absoluto do arquivo a remover
   */
  deleteFile(filePath: string): void {
    this.store.deleteByFile(filePath)
  }

  /** search
   * Descrição: Busca híbrida combinando FTS (palavras-chave) e similaridade vetorial.
   * Se embeddings não configurado, usa apenas FTS. Combina scores com pesos
   * FTS(0.4) + vector(0.6) para resultados híbridos.
   * @param query - Texto de busca
   * @param limit - Número máximo de resultados (default: 10)
   * @returns Array de resultados ordenados por score decrescente
   */
  async search(query: string, limit = 10): Promise<SearchResult[]> {
    const results = new Map<string, SearchResult>()

    // 1. FTS search
    const ftsHits = this.store.searchFts(sanitizeFtsQuery(query), limit * 2)
    for (const hit of ftsHits) {
      const chunk = this.store.getChunkById(hit.id)
      if (!chunk) continue
      results.set(hit.id, { chunk, score: hit.score * 0.7, source: 'fts' })
    }

    // 2. Vector search (se embeddings disponível)
    if (this.embedding) {
      const queryVec = await this.embedding.embed(query)
      if (queryVec) {
        const allVectors = this.store.getAllVectors()
        const vectorHits = computeTopK(queryVec, allVectors, limit * 2)

        for (const hit of vectorHits) {
          const chunk = this.store.getChunkById(hit.chunkId)
          if (!chunk) continue

          const existing = results.get(hit.chunkId)
          if (existing) {
            // Combina scores: FTS(0.4) + vector(0.6)
            existing.score = existing.score * 0.4 + hit.score * 0.6
            existing.source = 'hybrid'
          } else {
            results.set(hit.chunkId, { chunk, score: hit.score * 0.6, source: 'vector' })
          }
        }
      }
    }

    // Ordena por score e retorna top-K
    return Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  /** getStats
   * Descrição: Retorna estatísticas do índice atual
   * @returns Objeto com total de arquivos, chunks, data de indexação e status de vetores
   */
  getStats(): IndexStats {
    const stats = this.store.getStats()
    const files = this.store.getIndexedFiles()
    return {
      totalFiles: files.length,
      totalChunks: stats.totalChunks,
      indexedAt: stats.indexedAt,
      workspacePath: this.config.workspacePath,
      hasVectors: stats.totalVectors > 0,
    }
  }

  /** clear
   * Descrição: Limpa o índice completamente (remove todos os dados)
   */
  clear(): void {
    this.store.clear()
  }

  /** close
   * Descrição: Fecha a conexão com o banco de dados SQLite
   */
  close(): void {
    this.store.close()
  }

  /** needsReindex
   * Descrição: Verifica se o workspace precisa ser reindexado (nunca indexado
   * ou workspace não encontrado)
   * @returns true se o índice precisa ser recriado
   */
  needsReindex(): boolean {
    const stats = this.store.getStats()
    if (!stats.indexedAt) return true

    // Heurística: checa se workspace ainda existe
    try {
      statSync(this.config.workspacePath)
      return false
    } catch {
      return true
    }
  }
}

/** createCodebaseIndexer
 * Descrição: Factory function para criar uma instância do CodebaseIndexer
 * @param config - Configuração do indexador
 * @returns Nova instância do CodebaseIndexer
 */
export function createCodebaseIndexer(config: IndexerConfig): CodebaseIndexer {
  return new CodebaseIndexer(config)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** buildEmbeddingText
 * Descrição: Monta o texto para embedding a partir de um chunk, incluindo
 * nome do símbolo, linguagem e conteúdo (limitado a 512 chars)
 * @param chunk - Chunk de código fonte
 * @returns Texto formatado para geração de embedding
 */
function buildEmbeddingText(chunk: CodeChunk): string {
  const parts: string[] = []
  if (chunk.symbolName) parts.push(`${chunk.chunkType}: ${chunk.symbolName}`)
  parts.push(`language: ${chunk.language}`)
  parts.push(chunk.content.slice(0, 512))
  return parts.join('\n')
}

/** computeTopK
 * Descrição: Calcula os top-K resultados por similaridade de cosseno entre o
 * vetor de query e todos os vetores armazenados
 * @param queryVec - Vetor da query de busca
 * @param allVectors - Todos os vetores do banco
 * @param k - Número máximo de resultados
 * @returns Array de chunkId + score ordenado por score decrescente (score > 0.1)
 */
function computeTopK(
  queryVec: number[],
  allVectors: Array<{ chunkId: string; vector: Buffer }>,
  k: number,
): Array<{ chunkId: string; score: number }> {
  const scored = allVectors.map(({ chunkId, vector }) => ({
    chunkId,
    score: cosineSimilarity(queryVec, deserializeVector(vector)),
  }))

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, k).filter((s) => s.score > 0.1)
}

/** sanitizeFtsQuery
 * Descrição: Sanitiza uma query para FTS5, removendo caracteres especiais
 * que causam parse errors. Para múltiplas palavras, usa operador OR.
 * @param query - Query do usuário em texto livre
 * @returns Query sanitizada compatível com FTS5
 */
function sanitizeFtsQuery(query: string): string {
  // Remove aspas não fechadas e caracteres especiais do FTS5
  const cleaned = query.replace(/['"*^()[\]{}|&!]/g, ' ').trim()
  if (!cleaned) return '""'
  // Para buscas de múltiplas palavras, usa operador implícito OR
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    return words.join(' OR ')
  }
  return cleaned
}
