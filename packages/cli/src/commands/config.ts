/**
 * Comando `athion config` — Gerenciar configuração.
 * Descrição: Permite listar, consultar e definir valores de configuração do Athion.
 *
 * Subcomandos:
 *   list          — Mostra toda a configuração
 *   get <key>     — Mostra valor de uma chave
 *   set <key> <v> — Define valor de uma chave
 */

import type { ArgumentsCamelCase, Argv } from 'yargs'

/** configCommand
 * Descrição: Configura os subcomandos de gerenciamento de configuração no yargs.
 * @param yargs - Instância do yargs para configuração dos subcomandos
 * @returns Instância do yargs com subcomandos list, get e set registrados
 */
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

/** configListHandler
 * Descrição: Exibe todas as configurações do Athion formatadas no terminal.
 * @returns Promise que resolve quando a listagem é concluída
 */
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

/** configGetHandler
 * Descrição: Exibe o valor de uma chave de configuração específica.
 * @param args - Argumentos do comando contendo a chave a ser consultada
 * @returns Promise que resolve quando o valor é exibido
 */
async function configGetHandler(args: ArgumentsCamelCase<{ key: string }>) {
  const { bootstrap } = await import('@athion/core')
  const core = await bootstrap()
  const value = core.config.get(args.key as never)
  process.stdout.write(`${String(value)}\n`)
}

/** configSetHandler
 * Descrição: Define o valor de uma chave de configuração, com parsing automático de tipos.
 * @param args - Argumentos do comando contendo a chave e o valor a ser definido
 * @returns Promise que resolve quando o valor é definido
 */
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
