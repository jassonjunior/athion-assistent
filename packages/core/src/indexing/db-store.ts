/**
 * DbStore — SQLite direto (sem drizzle) para o índice de codebase.
 *
 * Usa bun:sqlite para:
 *  1. Tabela `chunks` — metadados dos chunks
 *  2. Tabela `vectors` — vetores float32 serializados (BLOB)
 *  3. FTS5 virtual table `chunks_fts` — busca full-text
 *
 * Operações:
 *  - upsertChunk: insere ou atualiza um chunk
 *  - upsertVector: insere ou atualiza vetor de embedding
 *  - searchFts: busca FTS5 com ranking BM25
 *  - searchVectors: retorna todos os vetores para cosine similarity em JS
 *  - deleteByFile: remove todos os chunks de um arquivo
 *  - getStats: retorna contagens
 */

import { Database } from 'bun:sqlite'
import type { CodeChunk } from './types'

export interface StoredChunk extends CodeChunk {
  indexedAt: number
}

export interface StoredVector {
  chunkId: string
  vector: number[]
}

export class DbStore {
  private db: Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { create: true })
    this.db.run('PRAGMA journal_mode = WAL')
    this.db.run('PRAGMA synchronous = NORMAL')
    this.db.run('PRAGMA foreign_keys = ON')
    this.initSchema()
  }

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

  /** Insere ou atualiza um chunk. */
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

  /** Insere ou atualiza vetor de embedding (serializado como BLOB). */
  upsertVector(chunkId: string, vectorData: Buffer): void {
    this.db.run(`INSERT OR REPLACE INTO vectors (chunk_id, vector) VALUES (?, ?)`, [
      chunkId,
      vectorData,
    ])
  }

  /** Remove todos os chunks de um arquivo (cascades para vectors e fts). */
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

  /** Busca FTS5 com ranking BM25. Retorna IDs ordenados por relevância. */
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

  /** Retorna chunk completo por ID. */
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

  /** Retorna todos os vetores (para cosine similarity em JS). */
  getAllVectors(): Array<{ chunkId: string; vector: Buffer }> {
    return this.db
      .query<{ chunk_id: string; vector: Buffer }, []>(`SELECT chunk_id, vector FROM vectors`)
      .all()
      .map((r) => ({ chunkId: r.chunk_id, vector: r.vector }))
  }

  /** Retorna estatísticas. */
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

  /** Atualiza metadata de timestamp. */
  setIndexedAt(ts: Date): void {
    this.db.run(`INSERT OR REPLACE INTO index_meta (key, value) VALUES ('indexed_at', ?)`, [
      ts.getTime().toString(),
    ])
  }

  /** Remove todos os dados (reset completo). */
  clear(): void {
    this.db.run(`DELETE FROM chunks_fts`)
    this.db.run(`DELETE FROM vectors`)
    this.db.run(`DELETE FROM chunks`)
    this.db.run(`DELETE FROM index_meta`)
  }

  /** Retorna todos os file_paths únicos no índice. */
  getIndexedFiles(): string[] {
    return this.db
      .query<{ file_path: string }, []>(`SELECT DISTINCT file_path FROM chunks`)
      .all()
      .map((r) => r.file_path)
  }

  close(): void {
    this.db.close()
  }
}
