/**
 * Comando `athion skills` — Listar skills disponíveis.
 * Descrição: Skills são prompts em markdown que definem o comportamento dos subagentes.
 */

import type { Argv } from 'yargs'

/** skillsCommand
 * Descrição: Configura o comando yargs para listagem de skills.
 * @param yargs - Instância do yargs para configuração do comando
 * @returns Instância do yargs configurada
 */
export function skillsCommand(yargs: Argv) {
  return yargs
}

/** skillsHandler
 * Descrição: Handler que executa a listagem de skills disponíveis no terminal.
 * @returns Promise que resolve quando a listagem é concluída
 */
export async function skillsHandler() {
  const { bootstrap } = await import('@athion/core')
  const { resolve } = await import('node:path')

  const core = await bootstrap({
    skillsDir: resolve(import.meta.dir, '../../core/skills'),
  })

  const skills = core.skills.list()

  process.stdout.write(`\n  Skills disponíveis (${skills.length}):\n\n`)

  for (const skill of skills) {
    const name = skill.name.padEnd(15)
    const desc = skill.description.slice(0, 50)
    process.stdout.write(`  • ${name} ${desc}\n`)
  }

  process.stdout.write('\n')
}
