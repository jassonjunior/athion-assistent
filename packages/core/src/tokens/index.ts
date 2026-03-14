/** @module tokens
 * Descrição: Módulo de gerenciamento de tokens do Athion.
 * Reexporta o gerenciador de tokens e todos os tipos relacionados
 * (budget, estratégias de compactação e detecção de loops).
 */

/** createTokenManager - Fábrica do gerenciador de tokens */
export { createTokenManager } from './manager'
/** CompactionStrategy, LoopDetection, TokenBudget, TokenManager - Tipos do gerenciamento de tokens */
export type { CompactionStrategy, LoopDetection, TokenBudget, TokenManager } from './types'
