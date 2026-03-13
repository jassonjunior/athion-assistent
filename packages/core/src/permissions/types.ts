/** PermissionDecision
 * Descrição: Decisão de permissão para uma ação.
 * 'allow' executa sem perguntar, 'ask' pergunta ao usuário, 'deny' bloqueia.
 */
export type PermissionDecision = 'allow' | 'ask' | 'deny'

/** PermissionScope
 * Descrição: Escopo de validade da permissão.
 * 'once' vale apenas para esta execução, 'session' até fechar o Athion,
 * 'remember' é persistida no banco SQLite.
 */
export type PermissionScope = 'once' | 'session' | 'remember'

/** PermissionRule
 * Descrição: Regra de permissão que associa uma ação + alvo a uma decisão e escopo.
 */
export interface PermissionRule {
  /** Ação controlada (ex: 'read', 'write', 'bash', 'search') */
  action: string
  /** Alvo — path ou glob pattern (ex: '/src/**', '*') */
  target: string
  /** Decisão para esta combinação ação+alvo */
  decision: PermissionDecision
  /** Escopo de validade da regra */
  scope: PermissionScope
}

/** PermissionCheck
 * Descrição: Resultado da checagem de permissão.
 * Inclui a decisão e a regra que a originou (se houver).
 */
export interface PermissionCheck {
  /** Decisão final */
  decision: PermissionDecision
  /** Regra que originou a decisão (undefined se for o default 'ask') */
  rule?: PermissionRule
}

/** PermissionManager
 * Descrição: Interface do gerenciador de permissões.
 * Centraliza checagem e gerenciamento de permissões do Athion.
 */
export interface PermissionManager {
  /** check
   * Descrição: Verifica a permissão para uma ação em um alvo.
   * @param action - Ação a verificar (ex: 'read', 'write', 'bash')
   * @param target - Alvo da ação (ex: '/src/index.ts', 'npm install')
   * @returns Resultado com a decisão e a regra que a originou
   */
  check(action: string, target: string): PermissionCheck

  /** grant
   * Descrição: Adiciona uma regra de permissão.
   * Se scope='remember', persiste no banco SQLite.
   * @param rule - Regra de permissão a adicionar
   */
  grant(rule: PermissionRule): void

  /** clearSession
   * Descrição: Remove todas as regras de sessão (não remove as persistidas).
   */
  clearSession(): void

  /** listRules
   * Descrição: Lista todas as regras ativas (sessão + persistidas).
   * @returns Array com todas as regras
   */
  listRules(): PermissionRule[]
}
