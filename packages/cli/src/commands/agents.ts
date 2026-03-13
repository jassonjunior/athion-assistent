/**
 * Comando `athion agents` — Listar agentes disponíveis.
 * Descrição: Mostra os 7 subagentes built-in + qualquer agente registrado por plugins.
 */

import type { Argv } from 'yargs'

/** agentsCommand
 * Descrição: Configura o comando yargs para listagem de agentes.
 * @param yargs - Instância do yargs para configuração do comando
 * @returns Instância do yargs configurada
 */
export function agentsCommand(yargs: Argv) {
  return yargs
}

/** agentsHandler
 * Descrição: Handler que executa a listagem de agentes disponíveis no terminal.
 * @returns Promise que resolve quando a listagem é concluída
 */
export async function agentsHandler() {
  const { bootstrap } = await import('@athion/core')
  const { resolve } = await import('node:path')

  const core = await bootstrap({
    skillsDir: resolve(import.meta.dir, '../../core/skills'),
  })

  const agents = core.subagents.list()

  process.stdout.write(`\n  Agentes disponíveis (${agents.length}):\n\n`)

  for (const agent of agents) {
    process.stdout.write(`  • ${agent.name.padEnd(15)} ${agent.description}\n`)
  }

  process.stdout.write('\n')
}
