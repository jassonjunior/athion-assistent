import type { DatabaseManager } from '../storage/db'
import type {
  PermissionCheck,
  PermissionDecision,
  PermissionManager,
  PermissionRule,
} from './types'

/** matchGlob
 * Descrição: Verifica se um target bate com um glob pattern.
 * Suporta '*' (qualquer coisa num nível) e '**' (qualquer coisa em qualquer nível).
 * @param pattern - Glob pattern (ex: '/src/**', '*.ts', '*')
 * @param target - String a testar (ex: '/src/utils/helper.ts')
 * @returns true se o target bate com o pattern
 */
function matchGlob(pattern: string, target: string): boolean {
  if (pattern === '*') return true

  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '⟨GLOBSTAR⟩')
    .replace(/\*/g, '[^/]*')
    .replace(/⟨GLOBSTAR⟩/g, '.*')

  const regex = new RegExp(`^${regexStr}$`)
  return regex.test(target)
}

/** findMatchingRule
 * Descrição: Busca a primeira regra que bate com a ação e o target.
 * @param rules - Lista de regras a verificar
 * @param action - Ação a buscar
 * @param target - Alvo a testar contra os glob patterns
 * @returns A primeira regra que bate, ou undefined
 */
function findMatchingRule(
  rules: PermissionRule[],
  action: string,
  target: string,
): PermissionRule | undefined {
  return rules.find(
    (rule) => (rule.action === action || rule.action === '*') && matchGlob(rule.target, target),
  )
}

/** createPermissionManager
 * Descrição: Cria uma instância do Permission Manager.
 * Combina regras em memória (session) com regras persistidas no banco SQLite.
 * Prioridade: session rules > persistent rules > default 'ask'.
 * @param db - Instância do DatabaseManager para persistir regras 'remember'
 * @returns Instância do PermissionManager pronta para uso
 */
export function createPermissionManager(db: DatabaseManager): PermissionManager {
  const sessionRules: PermissionRule[] = []

  /** check
   * Descrição: Verifica a permissão para uma ação em um alvo.
   * Busca regras na ordem: session rules > persistent rules > default (ask).
   * @param action - Ação a verificar (ex: 'read', 'write', 'bash')
   * @param target - Alvo da ação (ex: '/src/index.ts', 'npm install')
   * @returns Resultado com a decisão e a regra que a originou
   */
  function check(action: string, target: string): PermissionCheck {
    // 1. Busca em regras de sessão (prioridade máxima)
    const sessionMatch = findMatchingRule(sessionRules, action, target)
    if (sessionMatch) {
      return { decision: sessionMatch.decision, rule: sessionMatch }
    }

    // Busca em regras persistidas no banco SQLite
    const persistent = db.getPermission(action, target)
    if (persistent) {
      return {
        decision: persistent.decision as PermissionDecision,
        rule: {
          action: persistent.action,
          target: persistent.target ?? '*',
          decision: persistent.decision as PermissionDecision,
          scope: persistent.scope as 'remember',
        },
      }
    }

    // Default: perguntar ao usuário
    return { decision: 'ask' }
  }

  /** grant
   * Descrição: Adiciona uma regra de permissão.
   * Se scope='remember', persiste no banco SQLite.
   * Se scope='session' ou 'once', mantém apenas em memória.
   * @param rule - Regra de permissão a adicionar
   */
  function grant(rule: PermissionRule): void {
    if (rule.scope === 'remember') {
      db.setPermission({
        action: rule.action,
        target: rule.target,
        decision: rule.decision,
        scope: rule.scope,
      })
    }

    if (rule.scope === 'session' || rule.scope === 'once') {
      sessionRules.push(rule)
    }
  }

  /** clearSession
   * Descrição: Remove todas as regras de sessão (não remove as persistidas).
   */
  function clearSession(): void {
    sessionRules.length = 0
  }

  /** listRules
   * Descrição: Lista todas as regras ativas (sessão + persistidas).
   * @returns Array com todas as regras
   */
  function listRules(): PermissionRule[] {
    const persistent = db.listPermissions().map((p) => ({
      action: p.action,
      target: p.target ?? '*',
      decision: p.decision as PermissionDecision,
      scope: p.scope as 'remember',
    }))

    return [...sessionRules, ...persistent]
  }

  return { check, grant, clearSession, listRules }
}
