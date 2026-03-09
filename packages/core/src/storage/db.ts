import { Database } from 'bun:sqlite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { randomUUID } from 'node:crypto'
import type { Message, NewMessage, NewPermission, Permission, Session } from './schema'
import * as schema from './schema'

/**
 * Interface pública do DatabaseManager.
 * Centraliza todas as operações de persistência do Athion.
 * Usa SQLite com WAL mode para leitura/escrita simultâneas.
 */
export interface DatabaseManager {
  // ─── Sessions ───────────────────────────────────────────────

  /**
   * Cria uma nova sessão para um projeto.
   * @param projectId - ID do projeto ao qual a sessão pertence
   * @param title - Título opcional (pode ser gerado depois pelo LLM)
   * @returns A sessão criada com id e timestamps
   */
  createSession(projectId: string, title?: string): Session

  /**
   * Busca uma sessão pelo ID.
   * @param id - UUID da sessão
   * @returns A sessão encontrada ou undefined se não existir
   */
  getSession(id: string): Session | undefined

  /**
   * Lista todas as sessões, opcionalmente filtrando por projeto.
   * @param projectId - Se informado, retorna apenas sessões deste projeto
   * @returns Array de sessões ordenadas por data de criação (mais recente primeiro)
   */
  listSessions(projectId?: string): Session[]

  /**
   * Atualiza campos de uma sessão existente.
   * @param id - UUID da sessão a ser atualizada
   * @param data - Campos a atualizar (title, metadata)
   */
  updateSession(id: string, data: Partial<Pick<Session, 'title' | 'metadata'>>): void

  /**
   * Deleta uma sessão e todas as suas mensagens (cascade).
   * @param id - UUID da sessão a ser deletada
   */
  deleteSession(id: string): void

  // ─── Messages ───────────────────────────────────────────────

  /**
   * Adiciona uma mensagem a uma sessão existente.
   * @param sessionId - UUID da sessão pai
   * @param message - Dados da mensagem (role, parts)
   * @returns A mensagem criada com id e timestamp
   */
  addMessage(sessionId: string, message: Pick<NewMessage, 'role' | 'parts'>): Message

  /**
   * Retorna todas as mensagens de uma sessão, ordenadas cronologicamente.
   * @param sessionId - UUID da sessão
   * @returns Array de mensagens ordenadas por createdAt (mais antiga primeiro)
   */
  getMessages(sessionId: string): Message[]

  /**
   * Deleta todas as mensagens de uma sessão (sem deletar a sessão).
   * @param sessionId - UUID da sessão
   */
  deleteMessages(sessionId: string): void

  // ─── Permissions ────────────────────────────────────────────

  /**
   * Busca uma permissão por ação e alvo.
   * @param action - Ação (ex: 'read', 'bash')
   * @param target - Alvo (ex: '/src/file.ts')
   * @returns A permissão encontrada ou undefined
   */
  getPermission(action: string, target: string): Permission | undefined

  /**
   * Salva uma nova permissão no banco.
   * @param permission - Dados da permissão (action, target, decision, scope)
   */
  setPermission(permission: Pick<NewPermission, 'action' | 'target' | 'decision' | 'scope'>): void

  /**
   * Lista todas as permissões salvas.
   * @returns Array de permissões
   */
  listPermissions(): Permission[]

  /**
   * Remove uma permissão pelo ID.
   * @param id - UUID da permissão
   */
  deletePermission(id: string): void

  // ─── Lifecycle ──────────────────────────────────────────────

  /** Fecha a conexão com o banco de dados */
  close(): void
}

/**
 * Pragmas SQL para otimizar performance do SQLite.
 * WAL permite leitura e escrita simultâneas.
 * Cache de 64MB melhora performance em consultas frequentes.
 */
const PRAGMAS = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA busy_timeout = 5000',
  'PRAGMA synchronous = NORMAL',
  'PRAGMA cache_size = -64000',
  'PRAGMA foreign_keys = ON',
  'PRAGMA temp_store = MEMORY',
]

/**
 * SQL para criar as tabelas do banco.
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

/**
 * Cria uma instância do DatabaseManager.
 * Abre (ou cria) o banco SQLite no path informado,
 * configura pragmas de performance e cria tabelas se necessário.
 *
 * @param dbPath - Caminho do arquivo .db (ex: '~/.athion/athion.db')
 * @returns Instância do DatabaseManager pronta para uso
 * @example
 * const db = createDatabaseManager('/home/user/.athion/athion.db')
 * const session = db.createSession('my-project', 'Nova sessão')
 * db.addMessage(session.id, { role: 'user', parts: [{ type: 'text', text: 'Olá!' }] })
 */
export function createDatabaseManager(dbPath: string): DatabaseManager {
  const sqlite = new Database(dbPath)

  for (const pragma of PRAGMAS) {
    sqlite.run(pragma)
  }
  sqlite.run(CREATE_TABLES)

  const db = drizzle(sqlite, { schema })

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

  function getSession(id: string): Session | undefined {
    return db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get()
  }

  function listSessions(projectId?: string): Session[] {
    if (projectId) {
      return db.select().from(schema.sessions).where(eq(schema.sessions.projectId, projectId)).all()
    }
    return db.select().from(schema.sessions).all()
  }

  function updateSession(id: string, data: Partial<Pick<Session, 'title' | 'metadata'>>): void {
    db.update(schema.sessions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.sessions.id, id))
      .run()
  }

  function deleteSession(id: string): void {
    db.delete(schema.sessions).where(eq(schema.sessions.id, id)).run()
  }

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

  function getMessages(sessionId: string): Message[] {
    return db.select().from(schema.messages).where(eq(schema.messages.sessionId, sessionId)).all()
  }

  function deleteMessages(sessionId: string): void {
    db.delete(schema.messages).where(eq(schema.messages.sessionId, sessionId)).run()
  }

  function getPermission(action: string, target: string): Permission | undefined {
    return db
      .select()
      .from(schema.permissions)
      .where(eq(schema.permissions.action, action))
      .all()
      .find((p) => p.target === target || p.target === '*')
  }

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

  function listPermissions(): Permission[] {
    return db.select().from(schema.permissions).all()
  }

  function deletePermission(id: string): void {
    db.delete(schema.permissions).where(eq(schema.permissions.id, id)).run()
  }

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
