/**
 * Comando `athion serve` — Inicia o servidor HTTP.
 * Será usado pela extensão VS Code e app desktop para comunicação IPC.
 *
 * Stub: será implementado na Fase 4 (IDE Extension).
 */

import type { Argv } from 'yargs'

export function serveCommand(yargs: Argv) {
  return yargs.option('port', {
    alias: 'p',
    type: 'number',
    default: 3000,
    describe: 'Porta do servidor HTTP',
  })
}

export async function serveHandler(args: { port: number }) {
  process.stdout.write(
    `\n  ⚠ O comando 'serve' será implementado na Fase 4.\n` +
      `  Porta configurada: ${args.port}\n\n`,
  )
}
