/** CodebaseIndexer
 * Descrição: Orquestra a indexação e busca do codebase.
 * Fluxo de indexação: walkDirectory -> chunkFile -> embedBatch -> upsert nos ports.
 * Fluxo de busca: TextSearch (palavras-chave) + VectorStore (similaridade semântica) = Hybrid.
 * Suporta atualização incremental (indexFile) e remoção (deleteFile).
 * Recebe dependências via constructor (Dependency Injection) para desacoplamento.
 */

import { readFileSync, statSync } from 'node:fs'
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
import type { VectorStorePort } from './ports/vector-store.port'
import type { TextSearchPort } from './ports/text-search.port'
import type { LlmEnricherPort } from './ports/llm-enricher.port'
import type { CodeChunk, IndexerConfig, IndexStats, SearchResult } from './types'

/** CodebaseIndexerDeps
 * Descrição: Dependências injetáveis do CodebaseIndexer.
 * Todas são opcionais — se não fornecidas, o indexer usa os adapters SQLite internos.
 */
export interface CodebaseIndexerDeps {
  /** vectorStore
   * Descrição: Port de armazenamento vetorial (default: SQLite brute-force via DbStore)
   */
  vectorStore?: VectorStorePort
  /** textSearch
   * Descrição: Port de busca full-text (default: SQLite FTS5 via DbStore)
   */
  textSearch?: TextSearchPort
  /** embedding
   * Descrição: Serviço de embeddings (default: criado a partir de embeddingBaseUrl da config)
   */
  embedding?: EmbeddingService | null
  /** enricher
   * Descrição: Port de enriquecimento LLM (default: NoopEnricher)
   */
  enricher?: LlmEnricherPort
}

/** CodebaseIndexer
 * Descrição: Classe principal que gerencia a indexação e busca semântica do codebase.
 * Combina FTS5 (busca por palavras) com embeddings (busca vetorial) para
 * busca híbrida de código. Recebe ports via DI para desacoplamento.
 */
export class CodebaseIndexer {
  /** store
   * Descrição: Instância do banco SQLite para persistência do índice (chunks + meta)
   */
  private store: DbStore
  /** vectorStore
   * Descrição: Port de armazenamento vetorial (null se não configurado)
   */
  private vectorStore: VectorStorePort | null
  /** textSearch
   * Descrição: Port de busca full-text (null se não configurado)
   */
  private textSearch: TextSearchPort | null
  /** embedding
   * Descrição: Serviço de embeddings (null se modo FTS-only)
   */
  private embedding: EmbeddingService | null
  /** enricher
   * Descrição: Port de enriquecimento LLM (null se não configurado)
   */
  private enricher: LlmEnricherPort | null
  /** config
   * Descrição: Configuração completa do indexador com valores padrão preenchidos
   */
  private config: Required<IndexerConfig>

  /** constructor
   * Descrição: Inicializa o indexador com configuração e dependências injetadas.
   * Se deps não fornecidas, usa os adapters internos (backward-compatible).
   * @param config - Configuração do indexador (workspace, banco, embeddings)
   * @param deps - Dependências injetáveis (vectorStore, textSearch, embedding)
   */
  constructor(config: IndexerConfig, deps: CodebaseIndexerDeps = {}) {
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

    // Ports injetados ou null (fallback para DbStore interno)
    this.vectorStore = deps.vectorStore ?? null
    this.textSearch = deps.textSearch ?? null
    this.enricher = deps.enricher ?? null

    // Embedding: injetado, criado a partir de config, ou null (FTS-only)
    if (deps.embedding !== undefined) {
      this.embedding = deps.embedding
    } else {
      this.embedding = this.config.embeddingBaseUrl
        ? createEmbeddingService({
            baseUrl: this.config.embeddingBaseUrl,
            model: this.config.embeddingModel,
          })
        : null
    }
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
    // Inicializa ports se configurados
    if (this.vectorStore) await this.vectorStore.initialize()
    if (this.textSearch) await this.textSearch.initialize()

    const files = await walkDirectory(this.config.workspacePath, {
      ignoredDirs: this.config.ignoredDirs,
    })

    let indexed = 0
    for (const filePath of files) {
      onProgress?.(indexed, files.length, filePath)
      await this.indexFile(filePath)
      indexed++
    }

    // Enrichment pós-indexação (L0, L4, L1)
    if (this.enricher) {
      await this.enrichL0(files)
      await this.enrichL4(files)
      await this.enrichL1(files)
    }

    this.store.setIndexedAt(new Date())
    return this.getStats()
  }

  /** indexFile
   * Descrição: Indexa (ou re-indexa) um único arquivo. Verifica file hash para
   * skip incremental. Remove chunks antigos antes de inserir os novos.
   * Gera embeddings se o serviço estiver configurado.
   * @param filePath - Caminho absoluto do arquivo a indexar
   * @param forceReindex - Se true, ignora o check de hash e re-indexa
   */
  async indexFile(filePath: string, forceReindex = false): Promise<void> {
    // Check de hash para indexação incremental (skip se não mudou)
    if (!forceReindex) {
      try {
        const content = readFileSync(filePath, 'utf-8')
        const hash = computeFileHash(content)
        const storedHash = this.store.getFileHash(filePath)
        if (storedHash === hash) return // Arquivo não mudou — skip
      } catch {
        // Erro ao ler arquivo — prossegue com indexação normal
      }
    }

    // Remove chunks antigos do arquivo antes de re-indexar
    this.store.deleteByFile(filePath)

    // Remove do TextSearch port se configurado
    if (this.textSearch) {
      await this.textSearch.removeDocuments({ filePath })
    }

    // Remove do VectorStore port se configurado
    if (this.vectorStore) {
      await this.vectorStore.deletePoints('chunks', {
        must: [{ key: 'filePath', match: { value: filePath } }],
      })
    }

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

    // Insere chunks no SQLite (store principal)
    for (const chunk of fullChunks) {
      this.store.upsertChunk(chunk)
    }

    // Indexa no TextSearch port se configurado
    if (this.textSearch) {
      for (const chunk of fullChunks) {
        await this.textSearch.indexDocument({
          id: chunk.id,
          content: chunk.content,
          symbolName: chunk.symbolName,
          filePath: chunk.filePath,
          language: chunk.language,
        })
      }
    }

    // Gera embeddings em batch (se configurado)
    if (this.embedding) {
      const texts = fullChunks.map((c) => buildEmbeddingText(c))
      const vectors = await this.embedding.embedBatch(texts)
      if (vectors) {
        // Salva no DbStore (backward-compatible)
        for (let i = 0; i < fullChunks.length; i++) {
          const chunk = fullChunks[i]
          const vec = vectors[i]
          if (chunk && vec) {
            this.store.upsertVector(chunk.id, serializeVector(vec))
          }
        }

        // Salva no VectorStore port se configurado
        if (this.vectorStore) {
          const points = fullChunks
            .map((chunk, i) => {
              const vec = vectors[i]
              if (!vec) return null
              return {
                id: chunk.id,
                vector: vec,
                payload: {
                  filePath: chunk.filePath,
                  language: chunk.language,
                  chunkType: chunk.chunkType,
                  symbolName: chunk.symbolName ?? '',
                },
              }
            })
            .filter((p): p is NonNullable<typeof p> => p !== null)

          await this.vectorStore.upsertPoints('chunks', points)
        }
      }
    }

    // Atualiza file hash após indexação bem-sucedida
    let fileHash = ''
    try {
      const content = readFileSync(filePath, 'utf-8')
      fileHash = computeFileHash(content)
      this.store.setFileHash(filePath, fileHash, fullChunks.length)
    } catch {
      // Arquivo pode ter sido deletado entre leitura e hash
    }

    // Enrichment L2 — gera sumário do arquivo via LLM
    if (this.enricher && fileHash) {
      try {
        const code = readFileSync(filePath, 'utf-8')
        const result = await this.enricher.generateFileSummary(filePath, code)
        if (result.ok) {
          this.store.saveFileSummary(filePath, result.value, fileHash)
        }
      } catch {
        // Enrichment falha não deve interromper indexação
      }
    }
  }

  /** deleteFile
   * Descrição: Remove um arquivo do índice (para quando o arquivo foi deletado)
   * @param filePath - Caminho absoluto do arquivo a remover
   */
  async deleteFile(filePath: string): Promise<void> {
    this.store.deleteByFile(filePath)
    this.store.deleteFileHash(filePath)

    if (this.textSearch) {
      await this.textSearch.removeDocuments({ filePath })
    }

    if (this.vectorStore) {
      await this.vectorStore.deletePoints('chunks', {
        must: [{ key: 'filePath', match: { value: filePath } }],
      })
    }
  }

  /** search
   * Descrição: Busca híbrida combinando FTS (palavras-chave) e similaridade vetorial.
   * Se embeddings não configurado, usa apenas FTS. Combina scores com pesos
   * FTS(0.4) + vector(0.6) para resultados híbridos.
   * Usa ports quando disponíveis, senão fallback para DbStore.
   * @param query - Texto de busca
   * @param limit - Número máximo de resultados (default: 10)
   * @returns Array de resultados ordenados por score decrescente
   */
  async search(query: string, limit = 10): Promise<SearchResult[]> {
    const results = new Map<string, SearchResult>()

    // 1. FTS search (via port ou DbStore)
    if (this.textSearch) {
      const ftsHits = await this.textSearch.search(query, limit * 2)
      for (const hit of ftsHits) {
        const chunk = this.store.getChunkById(hit.id)
        if (!chunk) continue
        results.set(hit.id, { chunk, score: hit.score * 0.7, source: 'fts' })
      }
    } else {
      const ftsHits = this.store.searchFts(sanitizeFtsQuery(query), limit * 2)
      for (const hit of ftsHits) {
        const chunk = this.store.getChunkById(hit.id)
        if (!chunk) continue
        results.set(hit.id, { chunk, score: hit.score * 0.7, source: 'fts' })
      }
    }

    // 2. Vector search (via port ou brute-force no DbStore)
    if (this.embedding) {
      const queryVec = await this.embedding.embed(query)
      if (queryVec) {
        if (this.vectorStore) {
          // Usa o port de vectorStore
          const vectorHits = await this.vectorStore.search('chunks', {
            vector: queryVec,
            limit: limit * 2,
            scoreThreshold: 0.1,
          })

          for (const hit of vectorHits) {
            const chunk = this.store.getChunkById(hit.id)
            if (!chunk) continue

            const existing = results.get(hit.id)
            if (existing) {
              existing.score = existing.score * 0.4 + hit.score * 0.6
              existing.source = 'hybrid'
            } else {
              results.set(hit.id, { chunk, score: hit.score * 0.6, source: 'vector' })
            }
          }
        } else {
          // Fallback: brute-force via DbStore
          const allVectors = this.store.getAllVectors()
          const vectorHits = computeTopK(queryVec, allVectors, limit * 2)

          for (const hit of vectorHits) {
            const chunk = this.store.getChunkById(hit.chunkId)
            if (!chunk) continue

            const existing = results.get(hit.chunkId)
            if (existing) {
              existing.score = existing.score * 0.4 + hit.score * 0.6
              existing.source = 'hybrid'
            } else {
              results.set(hit.chunkId, { chunk, score: hit.score * 0.6, source: 'vector' })
            }
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
   * Descrição: Fecha a conexão com o banco de dados SQLite e os ports
   */
  async close(): Promise<void> {
    this.store.close()
    if (this.vectorStore) await this.vectorStore.close()
    if (this.textSearch) await this.textSearch.close()
  }

  /** needsReindex
   * Descrição: Verifica se o workspace precisa ser reindexado (nunca indexado
   * ou workspace não encontrado)
   * @returns true se o índice precisa ser recriado
   */
  /** enrichL0
   * Descrição: Gera metadata L0 do repositório via LLM (apenas se não existe)
   * @param files - Lista de arquivos do workspace
   */
  private async enrichL0(files: string[]): Promise<void> {
    if (!this.enricher || this.store.hasRepoMeta()) return
    try {
      let packageJson: string | undefined
      try {
        packageJson = readFileSync(`${this.config.workspacePath}/package.json`, 'utf-8')
      } catch {
        // Sem package.json
      }
      const result = await this.enricher.generateRepoMeta(files, packageJson)
      if (result.ok) {
        this.store.saveRepoMeta(result.value)
      }
    } catch {
      // Enrichment L0 falhou — não crítico
    }
  }

  /** enrichL4
   * Descrição: Gera análise L4 de padrões do codebase via LLM
   * Só regenera quando: tabela vazia, ou >30% dos arquivos mudaram
   * @param files - Lista de arquivos do workspace
   */
  private async enrichL4(files: string[]): Promise<void> {
    if (!this.enricher) return
    const hasPatterns = this.store.hasPatterns()
    if (hasPatterns && this.store.getChangedFileRatio() < 0.3) return

    try {
      const samples: Array<{ path: string; content: string }> = []
      for (const f of files.slice(0, 20)) {
        try {
          const content = readFileSync(f, 'utf-8')
          samples.push({ path: f, content: content.slice(0, 1500) })
        } catch {
          // Ignora arquivos inacessíveis
        }
      }
      if (samples.length === 0) return

      const result = await this.enricher.generatePatternAnalysis(samples)
      if (result.ok) {
        this.store.savePatterns(result.value)
      }
    } catch {
      // Enrichment L4 falhou — não crítico
    }
  }

  /** enrichL1
   * Descrição: Gera sumários L1 de módulos via LLM + DependencyGraph
   * Agrupa arquivos por diretório (módulo = dir com ≥2 arquivos de código)
   * @param files - Lista de arquivos do workspace
   */
  private async enrichL1(files: string[]): Promise<void> {
    if (!this.enricher) return
    try {
      const modules = new Map<string, string[]>()
      for (const f of files) {
        const dir = f.substring(0, f.lastIndexOf('/'))
        if (!modules.has(dir)) modules.set(dir, [])
        modules.get(dir)?.push(f)
      }

      for (const [dir, moduleFiles] of modules) {
        if (moduleFiles.length < 2) continue

        const fileInfos = moduleFiles
          .map((f) => {
            const summary = this.store.getFileSummary(f)
            return {
              path: f,
              exports: summary?.exports ?? [],
              purpose: summary?.purpose ?? '',
            }
          })
          .slice(0, 20)

        const result = await this.enricher.generateModuleSummary(dir, fileInfos)
        if (result.ok) {
          this.store.saveModule(dir, result.value, moduleFiles.length)
        }
      }
    } catch {
      // Enrichment L1 falhou — não crítico
    }
  }

  /** searchSymbols
   * Descrição: Busca símbolos no índice vetorial por similaridade semântica
   * @param query - Texto de busca
   * @param limit - Máximo de resultados (default: 10)
   * @returns Array de SearchResult filtrado por chunkType function/class/method
   */
  async searchSymbols(query: string, limit = 10): Promise<SearchResult[]> {
    const results = await this.search(query, limit * 2)
    return results
      .filter((r) => ['function', 'class', 'method'].includes(r.chunk.chunkType))
      .slice(0, limit)
  }

  /** searchFiles
   * Descrição: Busca arquivos relevantes no índice combinando FTS e vector search
   * @param query - Texto de busca
   * @param limit - Máximo de arquivos (default: 5)
   * @returns Array de filePaths únicos ordenados por relevância
   */
  async searchFiles(query: string, limit = 5): Promise<string[]> {
    const results = await this.search(query, limit * 3)
    const seen = new Set<string>()
    const files: string[] = []
    for (const r of results) {
      if (!seen.has(r.chunk.filePath)) {
        seen.add(r.chunk.filePath)
        files.push(r.chunk.filePath)
        if (files.length >= limit) break
      }
    }
    return files
  }

  /** getContextData
   * Descrição: Retorna dados de contexto do índice (L0, L4, L2 de arquivos específicos)
   * para montagem do prompt hierárquico pelo ContextAssembler.
   * @param filePaths - Arquivos relevantes para buscar L2/L3
   * @returns Dados de L0, L4 e L2 do índice
   */
  getContextData(filePaths?: string[]): {
    repoMeta: Record<string, unknown> | null
    patterns: {
      namingFunctions: string
      namingClasses: string
      namingConstants: string
      namingFiles: string
      namingVariables: string
      errorHandling: string
      importStyle: string
      testingPatterns: string
      architecturePatterns: string
      antiPatterns: string
    } | null
    fileSummaries: Array<{ filePath: string; purpose: string; exports: string[] }>
    symbols: CodeChunk[]
  } {
    const repoMeta = this.store.getRepoMeta()
    const patterns = this.store.getPatterns()

    let fileSummaries: Array<{ filePath: string; purpose: string; exports: string[] }> = []
    const symbols: CodeChunk[] = []

    if (filePaths && filePaths.length > 0) {
      // L2: sumários dos arquivos relevantes
      for (const fp of filePaths) {
        const summary = this.store.getFileSummary(fp)
        if (summary) {
          fileSummaries.push({
            filePath: fp,
            purpose: summary.purpose,
            exports: summary.exports,
          })
        }
      }
      // L3: chunks/symbols dos arquivos relevantes
      for (const fp of filePaths) {
        const chunks = this.store.getChunksByFile(fp)
        symbols.push(...chunks)
      }
    } else {
      fileSummaries = this.store.getAllFileSummaries()
    }

    return { repoMeta, patterns, fileSummaries, symbols }
  }

  needsReindex(): boolean {
    const stats = this.store.getStats()
    if (!stats.indexedAt) return true

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
 * @param deps - Dependências injetáveis opcionais (vectorStore, textSearch, embedding)
 * @returns Nova instância do CodebaseIndexer
 */
export function createCodebaseIndexer(
  config: IndexerConfig,
  deps?: CodebaseIndexerDeps,
): CodebaseIndexer {
  return new CodebaseIndexer(config, deps)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** computeFileHash
 * Descrição: Calcula hash MD5 do conteúdo de um arquivo para indexação incremental
 * @param content - Conteúdo do arquivo em texto
 * @returns Hash MD5 hexadecimal
 */
function computeFileHash(content: string): string {
  const hasher = new Bun.CryptoHasher('md5')
  hasher.update(content)
  return hasher.digest('hex')
}

/** buildEmbeddingText
 * Descrição: Monta o texto para embedding a partir de um chunk, incluindo
 * path do arquivo, nome do símbolo, linguagem e conteúdo (até 800 chars)
 * @param chunk - Chunk de código fonte
 * @returns Texto formatado para geração de embedding
 */
function buildEmbeddingText(chunk: CodeChunk): string {
  const parts: string[] = []
  parts.push(`File: ${chunk.filePath}`)
  if (chunk.symbolName) parts.push(`Symbol: ${chunk.symbolName} (${chunk.chunkType})`)
  parts.push(`Language: ${chunk.language}`)
  parts.push(chunk.content.slice(0, 800))
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
