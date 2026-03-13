import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** sessions
 * Descrição: Tabela de sessões Drizzle ORM. Cada sessão é uma conversa completa
 * que pertence a um projeto e pode ter várias mensagens.
 */
export const sessions = sqliteTable('sessions', {
  /** Identificador único da sessão (UUID) */
  id: text('id').primaryKey(),
  /** ID do projeto ao qual a sessão pertence */
  projectId: text('project_id').notNull(),
  /** Título descritivo da sessão (opcional, pode ser gerado pelo LLM) */
  title: text('title'),
  /** Timestamp de criação (Unix epoch em segundos) */
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  /** Timestamp da última atualização */
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  /** Metadados extras em formato JSON (modelo usado, tokens gastos, etc.) */
  metadata: text('metadata', { mode: 'json' }),
})

/** messages
 * Descrição: Tabela de mensagens Drizzle ORM. Armazena o histórico completo da conversa
 * (user, assistant, system, tool). Cascade delete ao deletar a sessão pai.
 */
export const messages = sqliteTable('messages', {
  /** Identificador único da mensagem (UUID) */
  id: text('id').primaryKey(),
  /** ID da sessão pai — referência com cascade delete */
  sessionId: text('session_id')
    .references(() => sessions.id, { onDelete: 'cascade' })
    .notNull(),
  /** Papel do autor da mensagem */
  role: text('role', { enum: ['user', 'assistant', 'system', 'tool'] }).notNull(),
  /** Conteúdo da mensagem em formato JSON (suporta múltiplas partes: texto, tool calls, etc.) */
  parts: text('parts', { mode: 'json' }).notNull(),
  /** Timestamp de criação */
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

/** permissions
 * Descrição: Tabela de permissões Drizzle ORM. Armazena regras de acesso persistidas
 * (apenas scope='remember'). Regras 'once' e 'session' ficam em memória.
 */
export const permissions = sqliteTable('permissions', {
  /** Identificador único da permissão (UUID) */
  id: text('id').primaryKey(),
  /** Ação controlada (ex: 'read', 'write', 'bash', '*') */
  action: text('action').notNull(),
  /** Alvo da ação — path ou glob pattern (ex: '/src/**', '*') */
  target: text('target'),
  /** Decisão: allow (liberar), ask (perguntar), deny (negar) */
  decision: text('decision', { enum: ['allow', 'ask', 'deny'] }).notNull(),
  /** Escopo da permissão: once (1 vez), session (até fechar), remember (persistido) */
  scope: text('scope', { enum: ['once', 'session', 'remember'] }).notNull(),
  /** Timestamp de criação */
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

/** Session
 * Descrição: Tipo inferido de uma sessão completa (todas as colunas da tabela sessions).
 */
export type Session = typeof sessions.$inferSelect
/** NewSession
 * Descrição: Tipo para inserir uma nova sessão (colunas obrigatórias e opcionais).
 */
export type NewSession = typeof sessions.$inferInsert

/** Message
 * Descrição: Tipo inferido de uma mensagem completa (todas as colunas da tabela messages).
 */
export type Message = typeof messages.$inferSelect
/** NewMessage
 * Descrição: Tipo para inserir uma nova mensagem (colunas obrigatórias e opcionais).
 */
export type NewMessage = typeof messages.$inferInsert

/** Permission
 * Descrição: Tipo inferido de uma permissão completa (todas as colunas da tabela permissions).
 */
export type Permission = typeof permissions.$inferSelect
/** NewPermission
 * Descrição: Tipo para inserir uma nova permissão (colunas obrigatórias e opcionais).
 */
export type NewPermission = typeof permissions.$inferInsert
