/** @module permissions
 * Descrição: Módulo de permissões do Athion.
 * Reexporta o gerenciador de permissões e todos os tipos relacionados.
 */

/** createPermissionManager - Fábrica do gerenciador de permissões */
export { createPermissionManager } from './permissions'
/** PermissionCheck, PermissionDecision, PermissionManager, PermissionRule, PermissionScope - Tipos de permissões */
export type {
  PermissionCheck,
  PermissionDecision,
  PermissionManager,
  PermissionRule,
  PermissionScope,
} from './types'
