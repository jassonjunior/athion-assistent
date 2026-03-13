/**
 * Comando `athion sessions` — Gerenciar sessões.
 * Descrição: Permite listar e deletar sessões de conversa do Athion.
 *
 * Subcomandos:
 *   list             — Lista todas as sessões
 *   delete <id>      — Deleta uma sessão
 */

import type { ArgumentsCamelCase, Argv } from 'yargs'

/** sessionsCommand
 * Descrição: Configura os subcomandos de gerenciamento de sessões no yargs.
 * @param yargs - Instância do yargs para configuração dos subcomandos
 * @returns Instância do yargs com subcomandos list e delete registrados
 */
export function sessionsCommand(yargs: Argv) {
  return yargs
    .command('list', 'Listar todas as sessões', {}, sessionsListHandler)
    .command(
      'delete <id>',
      'Deletar uma sessão',
      (y: Argv) => y.positional('id', { type: 'string', demandOption: true }),
      sessionsDeleteHandler as never,
    )
    .demandCommand(1, 'Especifique um subcomando: list, delete')
}

/** sessionsListHandler
 * Descrição: Lista todas as sessões de conversa existentes em formato tabular.
 * @returns Promise que resolve quando a listagem é concluída
 */
async function sessionsListHandler() {
  const { bootstrap } = await import('@athion/core')
  const core = await bootstrap()

  const sessions = core.orchestrator.listSessions()

  if (sessions.length === 0) {
    process.stdout.write('\n  Nenhuma sessão encontrada.\n\n')
    return
  }

  process.stdout.write(`\n  Sessões (${sessions.length}):\n\n`)
  process.stdout.write(`  ${'ID'.padEnd(38)} ${'Título'.padEnd(25)} ${'Criado em'}\n`)
  process.stdout.write(`  ${'─'.repeat(38)} ${'─'.repeat(25)} ${'─'.repeat(20)}\n`)

  for (const s of sessions) {
    const id = s.id.padEnd(38)
    const title = (s.title ?? 'Sem título').padEnd(25)
    const date = new Date(s.createdAt).toLocaleString('pt-BR')
    process.stdout.write(`  ${id} ${title} ${date}\n`)
  }

  process.stdout.write('\n')
}

/** sessionsDeleteHandler
 * Descrição: Deleta uma sessão de conversa pelo seu ID.
 * @param args - Argumentos do comando contendo o ID da sessão a ser deletada
 * @returns Promise que resolve quando a sessão é deletada
 */
async function sessionsDeleteHandler(args: ArgumentsCamelCase<{ id: string }>) {
  const { bootstrap } = await import('@athion/core')
  const core = await bootstrap()

  core.orchestrator.deleteSession(args.id)
  process.stdout.write(`✓ Sessão ${args.id} deletada.\n`)
}
