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

  /** close
   * Descrição: Fecha a conexão com o banco de dados SQLite
   */
  close(): void {
    this.db.close()
  }
}
