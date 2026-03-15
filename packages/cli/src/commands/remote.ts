/**
 * Comando `athion remote` — Gerenciamento de repositórios remotos.
 * Descrição: Clone, sincroniza, lista e remove repositórios remotos para indexação.
 *
 * Subcomandos:
 *   add <url>          — Clona um repositório remoto (shallow + sparse)
 *   list               — Lista repositórios clonados localmente
 *   remove <path>      — Remove repositório local
 *   sync <path>        — Atualiza repositório já clonado
 *   cleanup            — Remove repositórios não acessados recentemente
 *
 * Exemplos:
 *   athion remote add https://github.com/user/repo --branch main
 *   athion remote list
 *   athion remote sync ~/.athion/repos/user/repo
 *   athion remote cleanup --days 30
 */

import type { ArgumentsCamelCase, Argv } from 'yargs'

/** remoteCommand
 * Descrição: Configura os subcomandos de gerenciamento de repositórios remotos no yargs.
 */
export function remoteCommand(yargs: Argv) {
  return yargs
    .command(
      'add <url>',
      'Clona um repositório remoto (shallow clone)',
      (y: Argv) =>
        y
          .positional('url', { type: 'string', demandOption: true, describe: 'URL do repositório' })
          .option('branch', { type: 'string', describe: 'Branch (default: main)' })
          .option('sparse', {
            type: 'string',
            describe: 'Padrões sparse-checkout (separados por vírgula)',
          })
          .option('register', {
            type: 'boolean',
            default: true,
            describe: 'Registra como workspace após clonar',
          }),
      remoteAddHandler as never,
    )
    .command(
      'list',
      'Lista repositórios remotos clonados localmente',
      (y: Argv) => y,
      remoteListHandler as never,
    )
    .command(
      'remove <path>',
      'Remove repositório remoto local',
      (y: Argv) =>
        y.positional('path', {
          type: 'string',
          demandOption: true,
          describe: 'Path local do repositório',
        }),
      remoteRemoveHandler as never,
    )
    .command(
      'sync <path>',
      'Atualiza repositório já clonado',
      (y: Argv) =>
        y.positional('path', {
          type: 'string',
          demandOption: true,
          describe: 'Path local do repositório',
        }),
      remoteSyncHandler as never,
    )
    .command(
      'cleanup',
      'Remove repositórios não acessados recentemente',
      (y: Argv) =>
        y.option('days', { type: 'number', default: 30, describe: 'Máximo de dias sem acesso' }),
      remoteCleanupHandler as never,
    )
    .demandCommand(1, 'Especifique um subcomando: add, list, remove, sync, cleanup')
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function remoteAddHandler(
  args: ArgumentsCamelCase<{ url: string; branch?: string; sparse?: string; register: boolean }>,
): Promise<void> {
  const { cloneRepo, toRemoteInfo, WorkspaceRegistry } = await import('@athion/core')

  const sparsePatterns = args.sparse?.split(',').map((s) => s.trim())

  process.stdout.write(`Clonando: ${args.url}\n`)

  try {
    const repo = cloneRepo(args.url, args.branch, sparsePatterns)

    process.stdout.write(`Repositório clonado!\n`)
    process.stdout.write(`  Owner : ${repo.owner}\n`)
    process.stdout.write(`  Nome  : ${repo.name}\n`)
    process.stdout.write(`  Path  : ${repo.localPath}\n`)
    process.stdout.write(`  Branch: ${repo.branch}\n`)

    if (args.register) {
      const registry = new WorkspaceRegistry()
      const remoteInfo = toRemoteInfo(repo)
      const ws = registry.addRemote(repo.localPath, remoteInfo, `${repo.owner}/${repo.name}`)
      process.stdout.write(`\nRegistrado como workspace: ${ws.id}\n`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`Erro ao clonar: ${msg}\n`)
    process.exitCode = 1
  }
}

async function remoteListHandler(): Promise<void> {
  const { listRepos } = await import('@athion/core')

  const repos = listRepos()

  if (repos.length === 0) {
    process.stdout.write('Nenhum repositório remoto clonado.\n')
    process.stdout.write('Use `athion remote add <url>` para clonar.\n')
    return
  }

  process.stdout.write(`\n${repos.length} repositório(s) clonado(s):\n\n`)

  for (const r of repos) {
    process.stdout.write(`  ${r.owner}/${r.name}\n`)
    process.stdout.write(`    Path: ${r.localPath}\n\n`)
  }
}

async function remoteRemoveHandler(args: ArgumentsCamelCase<{ path: string }>): Promise<void> {
  const { removeRepo } = await import('@athion/core')

  removeRepo(args.path)
  process.stdout.write(`Repositório removido: ${args.path}\n`)
}

async function remoteSyncHandler(args: ArgumentsCamelCase<{ path: string }>): Promise<void> {
  const { syncRepo } = await import('@athion/core')

  process.stdout.write(`Sincronizando: ${args.path}\n`)

  try {
    syncRepo(args.path)
    process.stdout.write(`Repositório atualizado!\n`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`Erro ao sincronizar: ${msg}\n`)
    process.exitCode = 1
  }
}

async function remoteCleanupHandler(args: ArgumentsCamelCase<{ days: number }>): Promise<void> {
  const { cleanupStaleRepos } = await import('@athion/core')

  const removed = cleanupStaleRepos(args.days)

  if (removed.length === 0) {
    process.stdout.write('Nenhum repositório obsoleto encontrado.\n')
    return
  }

  process.stdout.write(`${removed.length} repositório(s) removido(s):\n`)
  for (const r of removed) {
    process.stdout.write(`  - ${r}\n`)
  }
}
