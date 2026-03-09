/**
 * Decisão de permissão para uma ação.
 * - 'allow': Executa sem perguntar ao usuário
 * - 'ask': Pergunta ao usuário antes de executar
 * - 'deny': Bloqueia a execução
 */
export type PermissionDecision = 'allow' | 'ask' | 'deny'

/**
 * Escopo de validade da permissão.
 * - 'once': Vale apenas para esta execução (não é salva)
 * - 'session': Vale até fechar o Athion (em memória)
 * - 'remember': Persistida no banco SQLite
 */
export type PermissionScope = 'once' | 'session' | 'remember'

/**
 * Regra de permissão — associa uma ação + alvo a uma decisão.
 * @example
 * { action: 'write', target: '/src/**', decision: 'allow', scope: 'session' }
 * { action: 'bash', target: '*', decision: 'ask', scope: 'remember' }
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

/**
 * Resultado da checagem de permissão.
 * Inclui a decisão e a regra que a originou (se houver).
 */
export interface PermissionCheck {
  /** Decisão final */
  decision: PermissionDecision
  /** Regra que originou a decisão (undefined se for o default 'ask') */
  rule?: PermissionRule
}

/**
 * Interface do Permission Manager.
 * Centraliza checagem e gerenciamento de permissões.
 */
export interface PermissionManager {
  /**
   * Verifica a permissão para uma ação em um alvo.
   * Busca regras na ordem: session rules → persistent rules → default (ask).
   * Usa glob matching para comparar targets.
   * @param action - Ação a verificar (ex: 'read', 'write', 'bash')
   * @param target - Alvo da ação (ex: '/src/index.ts', 'npm install')
   * @returns Resultado com a decisão e a regra que a originou
   */
  check(action: string, target: string): PermissionCheck

  /**
   * Adiciona uma regra de permissão.
   * Se scope='remember', persiste no banco SQLite.
   * Se scope='session', mantém apenas em memória.
   * @param rule - Regra de permissão a adicionar
   */
  grant(rule: PermissionRule): void

  /**
   * Remove todas as regras de sessão (não remove as persistidas).
   * Chamado quando o Athion é reiniciado.
   */
  clearSession(): void

  /**
   * Lista todas as regras ativas (sessão + persistidas).
   * @returns Array com todas as regras
   */
  listRules(): PermissionRule[]
}
