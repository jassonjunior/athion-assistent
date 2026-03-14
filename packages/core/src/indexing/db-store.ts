/** DbStore
 * Descrição: Armazenamento SQLite direto (sem ORM) para o índice de codebase.
 * Usa bun:sqlite para gerenciar:
 *  1. Tabela `chunks` — metadados dos chunks de código
 *  2. Tabela `vectors` — vetores float32 serializados como BLOB
 *  3. FTS5 virtual table `chunks_fts` — busca full-text com trigram
 *  4. Tabela `index_meta` — metadados do índice (timestamps, etc.)
 */

import { Database } from 'bun:sqlite'
import type { CodeChunk } from './types'

/** StoredChunk
 * Descrição: Chunk armazenado no banco com timestamp de indexação
 */
export interface StoredChunk extends CodeChunk {
  /** indexedAt
   * Descrição: Timestamp Unix de quando o chunk foi indexado
   */
  indexedAt: number
}

/** StoredVector
 * Descrição: Vetor de embedding armazenado no banco
 */
export interface StoredVector {
  /** chunkId
   * Descrição: ID do chunk ao qual este vetor pertence
   */
  chunkId: string
  /** vector
   * Descrição: Vetor de embedding como array de números
   */
  vector: number[]
}

/** DbStore
 * Descrição: Classe que gerencia o armazenamento SQLite do índice de codebase.
 * Fornece operações de CRUD para chunks, vetores e busca full-text.
 */
export class DbStore {
  /** db
   * Descrição: Instância do banco de dados SQLite
   */
  private db: Database

  /** constructor
   * Descrição: Inicializa o banco SQLite com WAL mode e cria as tabelas necessárias
   * @param dbPath - Caminho do arquivo SQLite
   */
  constructor(dbPath: string) {
    this.db = new Database(dbPath, { create: true })
    this.db.run('PRAGMA journal_mode = WAL')
    this.db.run('PRAGMA synchronous = NORMAL')
    this.db.run('PRAGMA foreign_keys = ON')
    this.initSchema()
  }

  /** initSchema
   * Descrição: Cria as tabelas e índices do schema se não existirem
   */
  private initSchema(): void {
    // Tabela principal de chunks
    this.db.run(`
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        language TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        content TEXT NOT NULL,
        symbol_name TEXT,
        chunk_type TEXT NOT NULL,
        indexed_at INTEGER NOT NULL
      )
    `)

    // Índice por file_path para deleção eficiente
    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_path)
    `)

    // Tabela de vetores (embeddings serializados)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS vectors (
        chunk_id TEXT PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
        vector BLOB NOT NULL
      )
    `)

    // FTS5 virtual table para busca full-text
    this.db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        id UNINDEXED,
        content,
        symbol_name,
        file_path UNINDEXED,
        language UNINDEXED,
        tokenize='trigram'
      )
    `)

    // Tabela de metadados do índice
    this.db.run(`
      CREATE TABLE IF NOT EXISTS index_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `)

    // Tabela de hashes de arquivo para indexação incremental (1.1)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS file_hashes (
        file_path TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        indexed_at INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL DEFAULT 0
      )
    `)

    // L0: Metadata do repositório (1.2)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS repo_meta (
        id INTEGER PRIMARY KEY DEFAULT 1,
        language TEXT,
        framework TEXT,
        test_framework TEXT,
        entry_points TEXT,
        build_system TEXT,
        architecture_style TEXT,
        database_tech TEXT,
        package_manager TEXT,
        generated_at INTEGER,
        schema_version INTEGER DEFAULT 1
      )
    `)

    // L1: Módulos / pacotes (1.2)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS modules (
        id TEXT PRIMARY KEY,
        module_path TEXT NOT NULL,
        purpose TEXT,
        public_api TEXT,
        depends_on TEXT,
        depended_by TEXT,
        file_count INTEGER DEFAULT 0,
        complexity TEXT DEFAULT 'medium',
        generated_at INTEGER
      )
    `)

    // L2: Sumários de arquivo (1.2)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS file_summaries (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL UNIQUE,
        purpose TEXT,
        exports TEXT,
        patterns TEXT,
        imports_external TEXT,
        imports_internal TEXT,
        complexity TEXT DEFAULT 'medium',
        file_hash TEXT,
        generated_at INTEGER
      )
    `)

    // L4: Padrões do codebase (1.2)
    this.db.run(`
      CREATE TABLE IF NOT EXISTS patterns (
        id INTEGER PRIMARY KEY DEFAULT 1,
        naming_functions TEXT,
        naming_classes TEXT,
        naming_constants TEXT,
        naming_files TEXT,
        naming_variables TEXT,
        error_handling TEXT,
        import_style TEXT,
        testing_patterns TEXT,
        architecture_patterns TEXT,
        anti_patterns TEXT,
        generated_at INTEGER,
        schema_version INTEGER DEFAULT 1
      )
    `)

    // Colunas opcionais em chunks (1.2) — try/catch pois ALTER TABLE falha se já existe
    this.tryAlterTable('ALTER TABLE chunks ADD COLUMN docstring TEXT')
    this.tryAlterTable('ALTER TABLE chunks ADD COLUMN throws TEXT')
    this.tryAlterTable('ALTER TABLE chunks ADD COLUMN signature TEXT')
    this.tryAlterTable('ALTER TABLE chunks ADD COLUMN imports TEXT')
  }

  /** tryAlterTable
   * Descrição: Executa ALTER TABLE ignorando erro se coluna já existe
   * @param sql - SQL do ALTER TABLE a executar
   */
  private tryAlterTable(sql: string): void {
    try {
      this.db.run(sql)
    } catch {
      // Coluna já existe — ignorar
    }
  }

  /** upsertChunk
   * Descrição: Insere ou atualiza um chunk no banco e no índice FTS
   * @param chunk - Chunk de código a persistir
   */
  upsertChunk(chunk: CodeChunk): void {
    const now = Date.now()
    this.db.run(
      `INSERT OR REPLACE INTO chunks
       (id, file_path, language, start_line, end_line, content, symbol_name, chunk_type, indexed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        chunk.id,
        chunk.filePath,
        chunk.language,
        chunk.startLine,
        chunk.endLine,
        chunk.content,
        chunk.symbolName ?? null,
        chunk.chunkType,
        now,
      ],
    )

    // Atualiza FTS
    this.db.run(`DELETE FROM chunks_fts WHERE id = ?`, [chunk.id])
    this.db.run(
      `INSERT INTO chunks_fts (id, content, symbol_name, file_path, language)
       VALUES (?, ?, ?, ?, ?)`,
      [chunk.id, chunk.content, chunk.symbolName ?? '', chunk.filePath, chunk.language],
    )
  }

  /** upsertVector
   * Descrição: Insere ou atualiza o vetor de embedding de um chunk
   * @param chunkId - ID do chunk ao qual o vetor pertence
   * @param vectorData - Buffer contendo o vetor serializado em float32 little-endian
   */
  upsertVector(chunkId: string, vectorData: Buffer): void {
    this.db.run(`INSERT OR REPLACE INTO vectors (chunk_id, vector) VALUES (?, ?)`, [
      chunkId,
      vectorData,
    ])
  }

  /** deleteByFile
   * Descrição: Remove todos os chunks de um arquivo (cascades para vectors e limpa FTS)
   * @param filePath - Caminho absoluto do arquivo cujos chunks serão removidos
   */
  deleteByFile(filePath: string): void {
    // Remove FTS entries manualmente (trigger não é suportado no FTS5)
    const chunks = this.db
      .query<{ id: string }, [string]>(`SELECT id FROM chunks WHERE file_path = ?`)
      .all(filePath)

    for (const { id } of chunks) {
      this.db.run(`DELETE FROM chunks_fts WHERE id = ?`, [id])
    }

    this.db.run(`DELETE FROM chunks WHERE file_path = ?`, [filePath])
  }

  /** searchFts
   * Descrição: Busca FTS5 com ranking BM25. Retorna IDs ordenados por relevância.
   * @param query - Termo de busca FTS5
   * @param limit - Número máximo de resultados (default: 20)
   * @returns Array de resultados com id, filePath e score normalizado 0-1
   */
  searchFts(query: string, limit = 20): Array<{ id: string; filePath: string; score: number }> {
    // FTS5 retorna rank negativo (menor = mais relevante)
    const rows = this.db
      .query<{ id: string; file_path: string; rank: number }, [string, number]>(
        `SELECT id, file_path, rank FROM chunks_fts
         WHERE chunks_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(query, limit)

    return rows.map((row) => ({
      id: row.id,
      filePath: row.file_path,
      // Normaliza rank para 0-1 (rank é negativo, -1 é máximo)
      score: Math.min(1, Math.max(0, 1 + row.rank / 10)),
    }))
  }

  /** getChunkById
   * Descrição: Retorna um chunk completo por seu ID
   * @param id - ID do chunk
   * @returns O chunk encontrado ou null se não existir
   */
  getChunkById(id: string): CodeChunk | null {
    const row = this.db
      .query<
        {
          id: string
          file_path: string
          language: string
          start_line: number
          end_line: number
          content: string
          symbol_name: string | null
          chunk_type: string
        },
        [string]
      >(`SELECT * FROM chunks WHERE id = ?`)
      .get(id)

    if (!row) return null

    const chunk: CodeChunk = {
      id: row.id,
      filePath: row.file_path,
      language: row.language,
      startLine: row.start_line,
      endLine: row.end_line,
      content: row.content,
      chunkType: row.chunk_type as CodeChunk['chunkType'],
      ...(row.symbol_name !== null ? { symbolName: row.symbol_name } : {}),
    }
    return chunk
  }

  /** getAllVectors
   * Descrição: Retorna todos os vetores armazenados (para cosine similarity em JS)
   * @returns Array de objetos com chunkId e buffer do vetor
   */
  getAllVectors(): Array<{ chunkId: string; vector: Buffer }> {
    return this.db
      .query<{ chunk_id: string; vector: Buffer }, []>(`SELECT chunk_id, vector FROM vectors`)
      .all()
      .map((r) => ({ chunkId: r.chunk_id, vector: r.vector }))
  }

  /** getStats
   * Descrição: Retorna estatísticas do banco (total de chunks, vetores e data de indexação)
   * @returns Objeto com contagens e timestamp de indexação
   */
  getStats(): { totalChunks: number; totalVectors: number; indexedAt: Date | null } {
    const chunksRow = this.db
      .query<{ count: number }, []>(`SELECT COUNT(*) as count FROM chunks`)
      .get()
    const vectorsRow = this.db
      .query<{ count: number }, []>(`SELECT COUNT(*) as count FROM vectors`)
      .get()
    const metaRow = this.db
      .query<{ value: string }, [string]>(`SELECT value FROM index_meta WHERE key = ?`)
      .get('indexed_at')

    return {
      totalChunks: chunksRow?.count ?? 0,
      totalVectors: vectorsRow?.count ?? 0,
      indexedAt: metaRow ? new Date(Number(metaRow.value)) : null,
    }
  }

  /** setIndexedAt
   * Descrição: Atualiza o timestamp de indexação nos metadados
   * @param ts - Data da indexação
   */
  setIndexedAt(ts: Date): void {
    this.db.run(`INSERT OR REPLACE INTO index_meta (key, value) VALUES ('indexed_at', ?)`, [
      ts.getTime().toString(),
    ])
  }

  /** clear
   * Descrição: Remove todos os dados do índice (reset completo)
   */
  clear(): void {
    this.db.run(`DELETE FROM chunks_fts`)
    this.db.run(`DELETE FROM vectors`)
    this.db.run(`DELETE FROM chunks`)
    this.db.run(`DELETE FROM index_meta`)
  }

  /** getIndexedFiles
   * Descrição: Retorna todos os caminhos de arquivo únicos presentes no índice
   * @returns Array de caminhos absolutos de arquivos indexados
   */
  getIndexedFiles(): string[] {
    return this.db
      .query<{ file_path: string }, []>(`SELECT DISTINCT file_path FROM chunks`)
      .all()
      .map((r) => r.file_path)
  }

  /** getFileHash
   * Descrição: Retorna o hash armazenado para um arquivo
   * @param filePath - Caminho absoluto do arquivo
   * @returns Hash do conteúdo ou null se arquivo não indexado
   */
  getFileHash(filePath: string): string | null {
    const row = this.db
      .query<
        { content_hash: string },
        [string]
      >(`SELECT content_hash FROM file_hashes WHERE file_path = ?`)
      .get(filePath)
    return row?.content_hash ?? null
  }

  /** setFileHash
   * Descrição: Salva ou atualiza o hash de um arquivo após indexação
   * @param filePath - Caminho absoluto do arquivo
   * @param hash - Hash MD5 do conteúdo
   * @param chunkCount - Número de chunks gerados para o arquivo
   */
  setFileHash(filePath: string, hash: string, chunkCount: number): void {
    this.db.run(
      `INSERT OR REPLACE INTO file_hashes (file_path, content_hash, indexed_at, chunk_count)
       VALUES (?, ?, ?, ?)`,
      [filePath, hash, Date.now(), chunkCount],
    )
  }

  /** deleteFileHash
   * Descrição: Remove o hash de um arquivo do banco
   * @param filePath - Caminho absoluto do arquivo
   */
  deleteFileHash(filePath: string): void {
    this.db.run(`DELETE FROM file_hashes WHERE file_path = ?`, [filePath])
  }

  /** getRepoMeta
   * Descrição: Retorna metadata L0 do repositório
   * @returns Objeto com campos L0 ou null se não gerado
   */
  getRepoMeta(): Record<string, unknown> | null {
    const row = this.db
      .query<Record<string, unknown>, []>(`SELECT * FROM repo_meta WHERE id = 1`)
      .get()
    return row ?? null
  }

  /** saveRepoMeta
   * Descrição: Salva metadata L0 do repositório
   * @param meta - Campos de metadata a salvar
   */
  saveRepoMeta(meta: {
    language: string
    framework: string
    testFramework: string
    entryPoints: string[]
    buildSystem: string
    architectureStyle: string
    databaseTech: string
    packageManager: string
  }): void {
    this.db.run(
      `INSERT OR REPLACE INTO repo_meta
       (id, language, framework, test_framework, entry_points, build_system,
        architecture_style, database_tech, package_manager, generated_at, schema_version)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        meta.language,
        meta.framework,
        meta.testFramework,
        JSON.stringify(meta.entryPoints),
        meta.buildSystem,
        meta.architectureStyle,
        meta.databaseTech,
        meta.packageManager,
        Date.now(),
      ],
    )
  }

  /** saveFileSummary
   * Descrição: Salva sumário L2 de um arquivo
   * @param filePath - Caminho do arquivo
   * @param summary - Dados do sumário
   * @param fileHash - Hash do conteúdo do arquivo
   */
  saveFileSummary(
    filePath: string,
    summary: {
      purpose: string
      exports: string[]
      patterns: string[]
      importsExternal: string[]
      importsInternal: string[]
      complexity: string
    },
    fileHash: string,
  ): void {
    const id = `l2:${filePath}`
    this.db.run(
      `INSERT OR REPLACE INTO file_summaries
       (id, file_path, purpose, exports, patterns, imports_external,
        imports_internal, complexity, file_hash, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        filePath,
        summary.purpose,
        JSON.stringify(summary.exports),
        JSON.stringify(summary.patterns),
        JSON.stringify(summary.importsExternal),
        JSON.stringify(summary.importsInternal),
        summary.complexity,
        fileHash,
        Date.now(),
      ],
    )
  }

  /** getFileSummary
   * Descrição: Retorna sumário L2 de um arquivo
   * @param filePath - Caminho do arquivo
   * @returns Sumário ou null se não existir
   */
  getFileSummary(filePath: string): {
    purpose: string
    exports: string[]
    fileHash: string
  } | null {
    const row = this.db
      .query<
        { purpose: string; exports: string; file_hash: string },
        [string]
      >(`SELECT purpose, exports, file_hash FROM file_summaries WHERE file_path = ?`)
      .get(filePath)
    if (!row) return null
    return {
      purpose: row.purpose ?? '',
      exports: JSON.parse(row.exports || '[]'),
      fileHash: row.file_hash ?? '',
    }
  }

  /** savePatterns
   * Descrição: Salva análise L4 de padrões do codebase
   * @param patterns - Dados de padrões
   */
  savePatterns(patterns: {
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
  }): void {
    this.db.run(
      `INSERT OR REPLACE INTO patterns
       (id, naming_functions, naming_classes, naming_constants, naming_files,
        naming_variables, error_handling, import_style, testing_patterns,
        architecture_patterns, anti_patterns, generated_at, schema_version)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        patterns.namingFunctions,
        patterns.namingClasses,
        patterns.namingConstants,
        patterns.namingFiles,
        patterns.namingVariables,
        patterns.errorHandling,
        patterns.importStyle,
        patterns.testingPatterns,
        patterns.architecturePatterns,
        patterns.antiPatterns,
        Date.now(),
      ],
    )
  }

  /** hasPatterns
   * Descrição: Verifica se L4 já foi gerado
   */
  hasPatterns(): boolean {
    const row = this.db.query<{ count: number }, []>(`SELECT COUNT(*) as count FROM patterns`).get()
    return (row?.count ?? 0) > 0
  }

  /** hasRepoMeta
   * Descrição: Verifica se L0 já foi gerado
   */
  hasRepoMeta(): boolean {
    const row = this.db
      .query<{ count: number }, []>(`SELECT COUNT(*) as count FROM repo_meta`)
      .get()
    return (row?.count ?? 0) > 0
  }

  /** saveModule
   * Descrição: Salva sumário L1 de um módulo
   * @param modulePath - Caminho do diretório do módulo
   * @param summary - Dados do sumário
   * @param fileCount - Número de arquivos no módulo
   */
  saveModule(
    modulePath: string,
    summary: {
      purpose: string
      publicApi: string[]
      dependsOn: string[]
      dependedBy: string[]
    },
    fileCount: number,
  ): void {
    const id = `l1:${modulePath}`
    this.db.run(
      `INSERT OR REPLACE INTO modules
       (id, module_path, purpose, public_api, depends_on, depended_by, file_count, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        modulePath,
        summary.purpose,
        JSON.stringify(summary.publicApi),
        JSON.stringify(summary.dependsOn),
        JSON.stringify(summary.dependedBy),
        fileCount,
        Date.now(),
      ],
    )
  }

  /** getFileSummariesForModule
   * Descrição: Retorna sumários L2 de todos os arquivos em um diretório
   * @param dirPath - Caminho do diretório
   * @returns Array de sumários com path, purpose e exports
   */
  getFileSummariesForModule(
    dirPath: string,
  ): Array<{ path: string; purpose: string; exports: string[] }> {
    const rows = this.db
      .query<
        { file_path: string; purpose: string; exports: string },
        [string]
      >(`SELECT file_path, purpose, exports FROM file_summaries WHERE file_path LIKE ? || '%'`)
      .all(dirPath)
    return rows.map((r) => ({
      path: r.file_path,
      purpose: r.purpose ?? '',
      exports: JSON.parse(r.exports || '[]'),
    }))
  }

  /** getChangedFileRatio
   * Descrição: Calcula a proporção de arquivos que mudaram desde a última geração de L4
   * @returns Razão entre 0 e 1
   */
  getChangedFileRatio(): number {
    const totalRow = this.db
      .query<{ count: number }, []>(`SELECT COUNT(*) as count FROM file_hashes`)
      .get()
    const total = totalRow?.count ?? 0
    if (total === 0) return 1

    const patternsRow = this.db
      .query<{ generated_at: number }, []>(`SELECT generated_at FROM patterns WHERE id = 1`)
      .get()
    if (!patternsRow) return 1

    const changedRow = this.db
      .query<
        { count: number },
        [number]
      >(`SELECT COUNT(*) as count FROM file_hashes WHERE indexed_at > ?`)
      .get(patternsRow.generated_at)
    return (changedRow?.count ?? 0) / total
  }

  /** getSchemaVersion
   * Descrição: Retorna a versão do schema atual do índice
   */
  getSchemaVersion(): {
    version: number
    embeddingModel: string
    embeddingDimensions: number
  } | null {
    const version = this.db
      .query<{ value: string }, [string]>(`SELECT value FROM index_meta WHERE key = ?`)
      .get('schema_version')
    if (!version) return null
    const model = this.db
      .query<{ value: string }, [string]>(`SELECT value FROM index_meta WHERE key = ?`)
      .get('embedding_model')
    const dims = this.db
      .query<{ value: string }, [string]>(`SELECT value FROM index_meta WHERE key = ?`)
      .get('embedding_dimensions')
    return {
      version: Number(version.value),
      embeddingModel: model?.value ?? 'unknown',
      embeddingDimensions: Number(dims?.value ?? 768),
    }
  }

  /** setSchemaVersion
   * Descrição: Salva versão do schema e metadata do embedding
   */
  setSchemaVersion(version: number, embeddingModel: string, embeddingDimensions: number): void {
    this.db.run(`INSERT OR REPLACE INTO index_meta (key, value) VALUES ('schema_version', ?)`, [
      String(version),
    ])
    this.db.run(`INSERT OR REPLACE INTO index_meta (key, value) VALUES ('embedding_model', ?)`, [
      embeddingModel,
    ])
    this.db.run(
      `INSERT OR REPLACE INTO index_meta (key, value) VALUES ('embedding_dimensions', ?)`,
      [String(embeddingDimensions)],
    )
  }

  /** needsReindexForSchema
   * Descrição: Verifica se é necessário re-indexar por mudança de schema ou modelo
   */
  needsReindexForSchema(currentVersion: number, currentModel: string): boolean {
    const stored = this.getSchemaVersion()
    if (!stored) return false
    return stored.version !== currentVersion || stored.embeddingModel !== currentModel
  }

  /** getPatterns
   * Descrição: Retorna dados L4 de padrões do codebase
   * @returns Objeto com campos de padrões ou null se não gerado
   */
  getPatterns(): {
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
  } | null {
    const row = this.db
      .query<Record<string, string | null>, []>(`SELECT * FROM patterns WHERE id = 1`)
      .get()
    if (!row) return null
    return {
      namingFunctions: (row.naming_functions as string) ?? '',
      namingClasses: (row.naming_classes as string) ?? '',
      namingConstants: (row.naming_constants as string) ?? '',
      namingFiles: (row.naming_files as string) ?? '',
      namingVariables: (row.naming_variables as string) ?? '',
      errorHandling: (row.error_handling as string) ?? '',
      importStyle: (row.import_style as string) ?? '',
      testingPatterns: (row.testing_patterns as string) ?? '',
      architecturePatterns: (row.architecture_patterns as string) ?? '',
      antiPatterns: (row.anti_patterns as string) ?? '',
    }
  }

  /** getAllFileSummaries
   * Descrição: Retorna todos os sumários L2 de arquivos
   * @returns Array com filePath, purpose e exports
   */
  getAllFileSummaries(): Array<{ filePath: string; purpose: string; exports: string[] }> {
    const rows = this.db
      .query<
        { file_path: string; purpose: string; exports: string },
        []
      >(`SELECT file_path, purpose, exports FROM file_summaries`)
      .all()
    return rows.map((r) => ({
      filePath: r.file_path,
      purpose: r.purpose ?? '',
      exports: JSON.parse(r.exports || '[]'),
    }))
  }

  /** getChunksByFile
   * Descrição: Retorna todos os chunks de um arquivo
   * @param filePath - Caminho do arquivo
   * @returns Array de CodeChunks
   */
  getChunksByFile(filePath: string): CodeChunk[] {
    const rows = this.db
      .query<
        {
          id: string
          file_path: string
          language: string
          start_line: number
          end_line: number
          content: string
          symbol_name: string | null
          chunk_type: string
        },
        [string]
      >(`SELECT * FROM chunks WHERE file_path = ?`)
      .all(filePath)

    return rows.map((row) => ({
      id: row.id,
      filePath: row.file_path,
      language: row.language,
      startLine: row.start_line,
      endLine: row.end_line,
      content: row.content,
      chunkType: row.chunk_type as CodeChunk['chunkType'],
      ...(row.symbol_name !== null ? { symbolName: row.symbol_name } : {}),
    }))
  }

  /** close
   * Descrição: Fecha a conexão com o banco de dados SQLite
   */
  close(): void {
    this.db.close()
  }
}
