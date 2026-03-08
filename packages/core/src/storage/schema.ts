import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Tabela de sessões — cada sessão é uma conversa completa.
 * Uma sessão pertence a um projeto e pode ter várias mensagens.
 * @example
 * // Uma sessão criada para o projeto "athion-assistent"
 * { id: 'abc123', projectId: 'athion-assistent', title: 'Refatorar config' }
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

/**
 * Tabela de mensagens — cada mensagem pertence a uma sessão.
 * Armazena o histórico completo da conversa (user, assistant, system, tool).
 * Cascade delete: ao deletar uma sessão, todas as mensagens são removidas.
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

/**
 * Tabela de permissões — regras de acesso persistidas.
 * Apenas permissões com scope='remember' são salvas aqui.
 * Permissões scope='once' e scope='session' ficam apenas em memória.
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

/** Tipo inferido de uma sessão completa (todas as colunas) */
export type Session = typeof sessions.$inferSelect
/** Tipo para inserir uma nova sessão (colunas obrigatórias) */
export type NewSession = typeof sessions.$inferInsert

/** Tipo inferido de uma mensagem completa */
export type Message = typeof messages.$inferSelect
/** Tipo para inserir uma nova mensagem */
export type NewMessage = typeof messages.$inferInsert

/** Tipo inferido de uma permissão completa */
export type Permission = typeof permissions.$inferSelect
/** Tipo para inserir uma nova permissão */
export type NewPermission = typeof permissions.$inferInsert
