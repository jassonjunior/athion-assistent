import { Database } from 'bun:sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { randomUUID } from 'node:crypto'
import type { Message, NewMessage, NewPermission, Permission, Session } from './schema'
import * as schema from './schema'

/** DatabaseManager
 * Descrição: Interface pública do gerenciador de banco de dados.
 * Centraliza todas as operações de persistência do Athion usando SQLite com WAL mode.
 */
export interface DatabaseManager {
  // ─── Sessions ───────────────────────────────────────────────

  /** createSession
   * Descrição: Cria uma nova sessão para um projeto.
   * @param projectId - ID do projeto ao qual a sessão pertence
   * @param title - Título opcional (pode ser gerado depois pelo LLM)
   * @returns A sessão criada com id e timestamps
   */
  createSession(projectId: string, title?: string): Session

  /** getSession
   * Descrição: Busca uma sessão pelo seu UUID.
   * @param id - UUID da sessão
   * @returns A sessão encontrada ou undefined se não existir
   */
  getSession(id: string): Session | undefined

  /** listSessions
   * Descrição: Lista todas as sessões, opcionalmente filtrando por projeto.
   * @param projectId - Se informado, retorna apenas sessões deste projeto
   * @returns Array de sessões
   */
  listSessions(projectId?: string): Session[]

  /** updateSession
   * Descrição: Atualiza campos de uma sessão existente.
   * @param id - UUID da sessão a ser atualizada
   * @param data - Campos a atualizar (title, metadata)
   */
  updateSession(id: string, data: Partial<Pick<Session, 'title' | 'metadata'>>): void

  /** deleteSession
   * Descrição: Deleta uma sessão e todas as suas mensagens (cascade).
   * @param id - UUID da sessão a ser deletada
   */
  deleteSession(id: string): void

  // ─── Messages ───────────────────────────────────────────────

  /** addMessage
   * Descrição: Adiciona uma mensagem a uma sessão existente.
   * @param sessionId - UUID da sessão pai
   * @param message - Dados da mensagem (role, parts)
   * @returns A mensagem criada com id e timestamp
   */
  addMessage(sessionId: string, message: Pick<NewMessage, 'role' | 'parts'>): Message

  /** getMessages
   * Descrição: Retorna todas as mensagens de uma sessão, ordenadas cronologicamente.
   * @param sessionId - UUID da sessão
   * @returns Array de mensagens ordenadas por createdAt
   */
  getMessages(sessionId: string): Message[]

  /** deleteMessages
   * Descrição: Deleta todas as mensagens de uma sessão (sem deletar a sessão).
   * @param sessionId - UUID da sessão
   */
  deleteMessages(sessionId: string): void

  // ─── Permissions ────────────────────────────────────────────

  /** getPermission
   * Descrição: Busca uma permissão por ação e alvo.
   * @param action - Ação (ex: 'read', 'bash')
   * @param target - Alvo (ex: '/src/file.ts')
   * @returns A permissão encontrada ou undefined
   */
  getPermission(action: string, target: string): Permission | undefined

  /** setPermission
   * Descrição: Salva uma nova permissão no banco de dados.
   * @param permission - Dados da permissão (action, target, decision, scope)
   */
  setPermission(permission: Pick<NewPermission, 'action' | 'target' | 'decision' | 'scope'>): void

  /** listPermissions
   * Descrição: Lista todas as permissões salvas.
   * @returns Array de permissões
   */
  listPermissions(): Permission[]

  /** deletePermission
   * Descrição: Remove uma permissão pelo ID.
   * @param id - UUID da permissão
   */
  deletePermission(id: string): void

  // ─── Lifecycle ──────────────────────────────────────────────

  /** close
   * Descrição: Fecha a conexão com o banco de dados SQLite.
   */
  close(): void
}

/** PRAGMAS
 * Descrição: Pragmas SQL para otimizar performance do SQLite.
 * WAL permite leitura/escrita simultâneas. Cache de 64MB.
 */
const PRAGMAS = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA busy_timeout = 5000',
  'PRAGMA synchronous = NORMAL',
  'PRAGMA cache_size = -64000',
  'PRAGMA foreign_keys = ON',
  'PRAGMA temp_store = MEMORY',
]

/** CREATE_TABLES
 * Descrição: SQL para criar as tabelas do banco (sessions, messages, permissions).
 * Executado automaticamente na primeira conexão.
 */
const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    metadata TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
    parts TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    target TEXT,
    decision TEXT NOT NULL CHECK(decision IN ('allow', 'ask', 'deny')),
    scope TEXT NOT NULL CHECK(scope IN ('once', 'session', 'remember')),
    created_at INTEGER NOT NULL
  );
`

/** createDatabaseManager
 * Descrição: Cria uma instância do DatabaseManager.
 * Abre (ou cria) o banco SQLite no path informado, configura pragmas de performance
 * e cria tabelas se necessário.
 * @param dbPath - Caminho do arquivo .db (ex: '~/.athion/athion.db')
 * @returns Instância do DatabaseManager pronta para uso
 */
export function createDatabaseManager(dbPath: string): DatabaseManager {
  const sqlite = new Database(dbPath)

  for (const pragma of PRAGMAS) {
    sqlite.run(pragma)
  }
  sqlite.run(CREATE_TABLES)

  const db = drizzle(sqlite, { schema })

  /** createSession
   * Descrição: Cria uma nova sessão para um projeto no banco de dados.
   * @param projectId - ID do projeto ao qual a sessão pertence
   * @param title - Título opcional da sessão
   * @returns A sessão criada com id e timestamps
   */
  function createSession(projectId: string, title?: string): Session {
    const now = new Date()
    const session = {
      id: randomUUID(),
      projectId,
      title: title ?? null,
      createdAt: now,
      updatedAt: now,
      metadata: null,
    }
    db.insert(schema.sessions).values(session).run()
    return session
  }

  /** getSession
   * Descrição: Busca uma sessão pelo seu UUID.
   * @param id - UUID da sessão
   * @returns A sessão encontrada ou undefined se não existir
   */
  function getSession(id: string): Session | undefined {
    return db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get()
  }

  /** listSessions
   * Descrição: Lista todas as sessões, opcionalmente filtrando por projeto.
   * @param projectId - Se informado, filtra sessões deste projeto
   * @returns Array de sessões
   */
  function listSessions(projectId?: string): Session[] {
    if (projectId) {
      return db.select().from(schema.sessions).where(eq(schema.sessions.projectId, projectId)).all()
    }
    return db.select().from(schema.sessions).all()
  }

  /** updateSession
   * Descrição: Atualiza campos de uma sessão existente (title e/ou metadata).
   * @param id - UUID da sessão a ser atualizada
   * @param data - Campos a atualizar
   */
  function updateSession(id: string, data: Partial<Pick<Session, 'title' | 'metadata'>>): void {
    db.update(schema.sessions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.sessions.id, id))
      .run()
  }

  /** deleteSession
   * Descrição: Deleta uma sessão e todas as suas mensagens (cascade).
   * @param id - UUID da sessão a ser deletada
   */
  function deleteSession(id: string): void {
    db.delete(schema.sessions).where(eq(schema.sessions.id, id)).run()
  }

  /** addMessage
   * Descrição: Adiciona uma mensagem a uma sessão existente no banco de dados.
   * @param sessionId - UUID da sessão pai
   * @param message - Dados da mensagem (role, parts)
   * @returns A mensagem criada com id e timestamp
   */
  function addMessage(sessionId: string, message: Pick<NewMessage, 'role' | 'parts'>): Message {
    const now = new Date()
    const msg = {
      id: randomUUID(),
      sessionId,
      role: message.role,
      parts: message.parts,
      createdAt: now,
    }
    db.insert(schema.messages).values(msg).run()
    return msg
  }

  /** getMessages
   * Descrição: Retorna todas as mensagens de uma sessão, ordenadas cronologicamente.
   * @param sessionId - UUID da sessão
   * @returns Array de mensagens ordenadas por createdAt
   */
  function getMessages(sessionId: string): Message[] {
    return db.select().from(schema.messages).where(eq(schema.messages.sessionId, sessionId)).all()
  }

  /** deleteMessages
   * Descrição: Deleta todas as mensagens de uma sessão (sem deletar a sessão).
   * @param sessionId - UUID da sessão
   */
  function deleteMessages(sessionId: string): void {
    db.delete(schema.messages).where(eq(schema.messages.sessionId, sessionId)).run()
  }

  /** getPermission
   * Descrição: Busca uma permissão por ação e alvo no banco de dados.
   * @param action - Ação a buscar (ex: 'read', 'bash')
   * @param target - Alvo a buscar (ex: '/src/file.ts')
   * @returns A permissão encontrada ou undefined
   */
  function getPermission(action: string, target: string): Permission | undefined {
    return db
      .select()
      .from(schema.permissions)
      .where(eq(schema.permissions.action, action))
      .all()
      .find((p) => p.target === target || p.target === '*')
  }

  /** setPermission
   * Descrição: Salva uma nova permissão no banco de dados.
   * @param permission - Dados da permissão (action, target, decision, scope)
   */
  function setPermission(
    permission: Pick<NewPermission, 'action' | 'target' | 'decision' | 'scope'>,
  ): void {
    db.insert(schema.permissions)
      .values({
        id: randomUUID(),
        ...permission,
        target: permission.target ?? null,
        createdAt: new Date(),
      })
      .run()
  }

  /** listPermissions
   * Descrição: Lista todas as permissões salvas no banco de dados.
   * @returns Array de permissões
   */
  function listPermissions(): Permission[] {
    return db.select().from(schema.permissions).all()
  }

  /** deletePermission
   * Descrição: Remove uma permissão pelo seu UUID.
   * @param id - UUID da permissão a ser removida
   */
  function deletePermission(id: string): void {
    db.delete(schema.permissions).where(eq(schema.permissions.id, id)).run()
  }

  /** close
   * Descrição: Fecha a conexão com o banco de dados SQLite.
   */
  function close(): void {
    sqlite.close()
  }

  return {
    createSession,
    getSession,
    listSessions,
    updateSession,
    deleteSession,
    addMessage,
    getMessages,
    deleteMessages,
    getPermission,
    setPermission,
    listPermissions,
    deletePermission,
    close,
  }
}
