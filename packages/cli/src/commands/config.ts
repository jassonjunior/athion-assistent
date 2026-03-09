/**
 * Comando `athion config` — Gerenciar configuração.
 *
 * Subcomandos:
 *   list          — Mostra toda a configuração
 *   get <key>     — Mostra valor de uma chave
 *   set <key> <v> — Define valor de uma chave
 */

import type { ArgumentsCamelCase, Argv } from 'yargs'

export function configCommand(yargs: Argv) {
  return yargs
    .command('list', 'Mostrar toda a configuração', {}, configListHandler)
    .command(
      'get <key>',
      'Mostrar valor de uma chave',
      (y: Argv) => y.positional('key', { type: 'string', demandOption: true }),
      configGetHandler as never,
    )
    .command(
      'set <key> <value>',
      'Definir valor de uma chave',
      (y: Argv) => {
        return y
          .positional('key', { type: 'string', demandOption: true })
          .positional('value', { type: 'string', demandOption: true })
      },
      configSetHandler as never,
    )
    .demandCommand(1, 'Especifique um subcomando: list, get, set')
}

async function configListHandler() {
  const { bootstrap } = await import('@athion/core')
  const core = await bootstrap()
  const all = core.config.getAll()
  const entries = Object.entries(all)
  const maxKey = Math.max(...entries.map(([k]) => k.length))

  for (const [key, value] of entries) {
    const v = typeof value === 'object' ? JSON.stringify(value) : String(value)
    process.stdout.write(`  ${key.padEnd(maxKey)}  ${v}\n`)
  }
}

async function configGetHandler(args: ArgumentsCamelCase<{ key: string }>) {
  const { bootstrap } = await import('@athion/core')
  const core = await bootstrap()
  const value = core.config.get(args.key as never)
  process.stdout.write(`${String(value)}\n`)
}

async function configSetHandler(args: ArgumentsCamelCase<{ key: string; value: string }>) {
  const { bootstrap } = await import('@athion/core')
  const core = await bootstrap()

  let parsed: unknown = args.value
  if (args.value === 'true') parsed = true
  else if (args.value === 'false') parsed = false
  else if (!isNaN(Number(args.value))) parsed = Number(args.value)

  core.config.set(args.key as never, parsed as never)
  process.stdout.write(`✓ ${args.key} = ${String(parsed)}\n`)
}
