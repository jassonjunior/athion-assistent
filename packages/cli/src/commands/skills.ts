/**
 * Comando `athion skills` — Listar skills disponíveis.
 * Skills são prompts em markdown que definem o comportamento dos subagentes.
 */

import type { Argv } from 'yargs'

export function skillsCommand(yargs: Argv) {
  return yargs
}

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
