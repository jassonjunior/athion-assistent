/** SqliteTextSearch
 * Descrição: Implementação do TextSearchPort usando SQLite FTS5 com tokenizer trigram.
 * Mantém uma virtual table `chunks_fts` para busca full-text eficiente.
 * BM25 ranking é usado para ordenar resultados por relevância.
 */

import { Database } from 'bun:sqlite'
import type { TextDocument, TextSearchPort, TextSearchResult } from '../ports/text-search.port'

/** SqliteTextSearch
 * Descrição: Adapter SQLite FTS5 para busca full-text de código.
 * Implementa TextSearchPort com tokenizer trigram e ranking BM25.
 */
export class SqliteTextSearch implements TextSearchPort {
  /** db
   * Descrição: Instância do banco de dados SQLite
   */
  private db: Database

  /** initialized
   * Descrição: Flag indicando se o schema FTS já foi criado
   */
  private initialized = false

  /** constructor
   * Descrição: Cria o store apontando para um arquivo SQLite
   * @param dbPath - Caminho do arquivo SQLite
   */
  constructor(private readonly dbPath: string) {
    this.db = new Database(dbPath, { create: true })
    this.db.run('PRAGMA journal_mode = WAL')
    this.db.run('PRAGMA synchronous = NORMAL')
  }

  /** initialize
   * Descrição: Cria a virtual table FTS5 se não existir
   */
  async initialize(): Promise<void> {
    if (this.initialized) return

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

    this.initialized = true
  }

  /** indexDocument
   * Descrição: Indexa um documento na tabela FTS5. Remove entrada anterior
   * com mesmo ID antes de inserir (upsert manual para FTS5).
   * @param doc - Documento a indexar
   */
  async indexDocument(doc: TextDocument): Promise<void> {
    // FTS5 não suporta INSERT OR REPLACE — remove e reinsere
    this.db.run(`DELETE FROM chunks_fts WHERE id = ?`, [doc.id])
    this.db.run(
      `INSERT INTO chunks_fts (id, content, symbol_name, file_path, language)
       VALUES (?, ?, ?, ?, ?)`,
      [doc.id, doc.content, doc.symbolName ?? '', doc.filePath, doc.language],
    )
  }

  /** removeDocuments
   * Descrição: Remove documentos do índice FTS por filePath ou IDs.
   * Se filePath informado, remove todos os documentos daquele arquivo.
   * Se IDs informados, remove os documentos com aqueles IDs.
   * @param filter - Critério de remoção
   */
  async removeDocuments(filter: { filePath?: string; ids?: string[] }): Promise<void> {
    if (filter.filePath) {
      this.db.run(`DELETE FROM chunks_fts WHERE file_path = ?`, [filter.filePath])
    }

    if (filter.ids && filter.ids.length > 0) {
      const placeholders = filter.ids.map(() => '?').join(',')
      this.db.run(`DELETE FROM chunks_fts WHERE id IN (${placeholders})`, filter.ids)
    }
  }

  /** search
   * Descrição: Busca FTS5 com ranking BM25. Retorna resultados ordenados
   * por relevância com score normalizado entre 0 e 1.
   * @param query - Texto de busca
   * @param limit - Número máximo de resultados (default: 20)
   * @returns Array de resultados com id, filePath e score
   */
  async search(query: string, limit = 20): Promise<TextSearchResult[]> {
    const sanitized = sanitizeFtsQuery(query)
    if (!sanitized) return []

    try {
      const rows = this.db
        .query<{ id: string; file_path: string; rank: number }, [string, number]>(
          `SELECT id, file_path, rank FROM chunks_fts
           WHERE chunks_fts MATCH ?
           ORDER BY rank
           LIMIT ?`,
        )
        .all(sanitized, limit)

      return rows.map((row) => ({
        id: row.id,
        filePath: row.file_path,
        // Normaliza rank para 0-1 (rank é negativo, -1 é máximo relevância)
        score: Math.min(1, Math.max(0, 1 + row.rank / 10)),
      }))
    } catch {
      // Query inválida para FTS5 — retorna vazio
      return []
    }
  }

  /** close
   * Descrição: Fecha a conexão com o banco de dados SQLite
   */
  async close(): Promise<void> {
    this.db.close()
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** sanitizeFtsQuery
 * Descrição: Sanitiza uma query para FTS5, removendo caracteres especiais
 * que causam parse errors. Para múltiplas palavras, usa operador OR.
 * @param query - Query do usuário em texto livre
 * @returns Query sanitizada compatível com FTS5 ou string vazia se inválida
 */
function sanitizeFtsQuery(query: string): string {
  const cleaned = query.replace(/['"*^()[\]{}|&!]/g, ' ').trim()
  if (!cleaned) return ''
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    return words.join(' OR ')
  }
  return cleaned
}
