/** @module storage
 * Descrição: Módulo de persistência do Athion.
 * Reexporta o gerenciador de banco SQLite, as tabelas Drizzle e todos os tipos
 * de entidades (sessions, messages, permissions).
 */

/** createDatabaseManager - Fábrica do gerenciador de banco SQLite */
export { createDatabaseManager } from './db'
/** DatabaseManager - Interface do gerenciador de banco de dados */
export type { DatabaseManager } from './db'
/** messages, permissions, sessions - Definições das tabelas Drizzle ORM */
export { messages, permissions, sessions } from './schema'
/** Message, NewMessage, NewPermission, NewSession, Permission, Session - Tipos das entidades */
export type { Message, NewMessage, NewPermission, NewSession, Permission, Session } from './schema'
