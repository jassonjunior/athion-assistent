/**
 * CodebaseIndexer — orquestra a indexação e busca do codebase.
 *
 * Fluxo de indexação:
 *  1. walkDirectory → lista arquivos respeitando .gitignore
 *  2. chunkFile → divide cada arquivo em chunks semânticos
 *  3. EmbeddingService.embedBatch → gera vetores (se configurado)
 *  4. DbStore.upsertChunk + upsertVector → persiste no SQLite
 *
 * Fluxo de busca:
 *  - FTS: DbStore.searchFts → resultados por palavras-chave (rápido)
 *  - Vector: getAllVectors → cosine similarity em JS (semântico)
 *  - Hybrid: combina FTS + Vector com re-ranking por score médio
 *
 * Atualização incremental:
 *  - indexFile: re-indexa apenas um arquivo específico
 *  - deleteFile: remove chunks de um arquivo deletado
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

export class CodebaseIndexer {
  private store: DbStore
  private embedding: EmbeddingService | null
  private config: Required<IndexerConfig>

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

  /** Indexa o workspace completo. Progresso via callback opcional. */
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

  /** Indexa (ou re-indexa) um único arquivo. */
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

  /** Remove um arquivo do índice (arquivo foi deletado). */
  deleteFile(filePath: string): void {
    this.store.deleteByFile(filePath)
  }

  /**
   * Busca híbrida: FTS + vector similarity.
   * Se embeddings não configurado, usa apenas FTS.
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

  /** Retorna estatísticas do índice. */
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

  /** Limpa o índice completamente. */
  clear(): void {
    this.store.clear()
  }

  /** Fecha conexão com o banco. */
  close(): void {
    this.store.close()
  }

  /** Verifica se o workspace mudou desde a última indexação. */
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

/** Cria instância do CodebaseIndexer. */
export function createCodebaseIndexer(config: IndexerConfig): CodebaseIndexer {
  return new CodebaseIndexer(config)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Texto para embedding: símbolo + linguagem + conteúdo. */
function buildEmbeddingText(chunk: CodeChunk): string {
  const parts: string[] = []
  if (chunk.symbolName) parts.push(`${chunk.chunkType}: ${chunk.symbolName}`)
  parts.push(`language: ${chunk.language}`)
  parts.push(chunk.content.slice(0, 512))
  return parts.join('\n')
}

/** Calcula top-K por cosine similarity. */
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

/**
 * Sanitiza query para FTS5.
 * Remove caracteres especiais que causam parse errors no FTS5.
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
