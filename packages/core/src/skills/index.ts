/** skills/index
 * Descrição: Barrel file do módulo de skills. Re-exporta todas as funções,
 * interfaces e tipos públicos do sistema de skills do Athion.
 */
export { createSkillManager } from './manager'
export { parseSkillFile } from './parser'
export { createSkillRegistry } from './registry'
export type {
  SkillDefinition,
  SkillManager,
  SkillRegistry,
  SkillRegistryEntry,
  SkillSearchResult,
} from './types'
