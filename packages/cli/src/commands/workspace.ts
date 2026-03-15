/**
 * Comando `athion workspace` — Gerenciamento de multi-workspace.
 * Descrição: Registra, lista, remove e busca em múltiplos workspaces indexados.
 *
 * Subcomandos:
 *   add <path>         — Registra um workspace local
 *   list               — Lista workspaces registrados
 *   remove <id>        — Remove workspace pelo ID
 *   search <query>     — Busca cross-workspace
 *
 * Exemplos:
 *   athion workspace add ./meu-projeto --name "Projeto A"
 *   athion workspace list
 *   athion workspace remove abc12345
 *   athion workspace search "autenticação JWT"
 */

import { resolve } from 'node:path'
import type { ArgumentsCamelCase, Argv } from 'yargs'

/** workspaceCommand
 * Descrição: Configura os subcomandos de gerenciamento multi-workspace no yargs.
 */
export function workspaceCommand(yargs: Argv) {
  return yargs
    .command(
      'add <path>',
      'Registra um workspace local para indexação',
      (y: Argv) =>
        y
          .positional('path', {
            type: 'string',
            demandOption: true,
            describe: 'Caminho do workspace',
          })
          .option('name', { type: 'string', describe: 'Nome amigável do workspace' }),
      workspaceAddHandler as never,
    )
    .command(
      'list',
      'Lista todos os workspaces registrados',
      (y: Argv) => y,
      workspaceListHandler as never,
    )
    .command(
      'remove <id>',
      'Remove um workspace pelo ID',
      (y: Argv) =>
        y.positional('id', { type: 'string', demandOption: true, describe: 'ID do workspace' }),
      workspaceRemoveHandler as never,
    )
    .command(
      'search <query>',
      'Busca em múltiplos workspaces simultaneamente',
      (y: Argv) =>
        y
          .positional('query', { type: 'string', demandOption: true })
          .option('limit', { type: 'number', default: 10, describe: 'Máximo de resultados' })
          .option('timeout', {
            type: 'number',
            default: 5000,
            describe: 'Timeout por workspace (ms)',
          })
          .option('workspaces', {
            type: 'string',
            describe: 'IDs dos workspaces (separados por vírgula)',
          }),
      workspaceSearchHandler as never,
    )
    .demandCommand(1, 'Especifique um subcomando: add, list, remove, search')
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function workspaceAddHandler(
  args: ArgumentsCamelCase<{ path: string; name?: string }>,
): Promise<void> {
  const { WorkspaceRegistry } = await import('@athion/core')

  const registry = new WorkspaceRegistry()
  const absPath = resolve(args.path)

  try {
    const ws = registry.add(absPath, args.name)
    process.stdout.write(`Workspace registrado!\n`)
    process.stdout.write(`  ID   : ${ws.id}\n`)
    process.stdout.write(`  Nome : ${ws.name}\n`)
    process.stdout.write(`  Path : ${ws.path}\n`)
    process.stdout.write(`  DB   : ${ws.indexDbPath}\n`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    process.stderr.write(`Erro: ${msg}\n`)
    process.exitCode = 1
  }
}

async function workspaceListHandler(): Promise<void> {
  const { WorkspaceRegistry } = await import('@athion/core')

  const registry = new WorkspaceRegistry()
  const workspaces = registry.list()

  if (workspaces.length === 0) {
    process.stdout.write('Nenhum workspace registrado.\n')
    process.stdout.write('Use `athion workspace add <path>` para registrar.\n')
    return
  }

  process.stdout.write(`\n${workspaces.length} workspace(s) registrado(s):\n\n`)

  for (const ws of workspaces) {
    const status = ws.isActive ? '●' : '○'
    const remote = ws.remote ? ` [remoto: ${ws.remote.url}]` : ''
    process.stdout.write(`  ${status} ${ws.id} — ${ws.name}${remote}\n`)
    process.stdout.write(`    Path: ${ws.path}\n`)
    process.stdout.write(`    Indexado: ${ws.lastIndexed}\n\n`)
  }
}

async function workspaceRemoveHandler(args: ArgumentsCamelCase<{ id: string }>): Promise<void> {
  const { WorkspaceRegistry } = await import('@athion/core')

  const registry = new WorkspaceRegistry()
  const removed = registry.remove(args.id)

  if (removed) {
    process.stdout.write(`Workspace ${args.id} removido.\n`)
  } else {
    process.stderr.write(`Workspace ${args.id} não encontrado.\n`)
    process.exitCode = 1
  }
}

async function workspaceSearchHandler(
  args: ArgumentsCamelCase<{ query: string; limit: number; timeout: number; workspaces?: string }>,
): Promise<void> {
  const { WorkspaceRegistry, crossWorkspaceSearch } = await import('@athion/core')

  const registry = new WorkspaceRegistry()
  const wsIds = args.workspaces?.split(',').map((s) => s.trim())

  const result = await crossWorkspaceSearch(registry, {
    query: args.query,
    limit: args.limit,
    timeoutMs: args.timeout,
    workspaces: wsIds,
    mergeStrategy: 'interleave',
  })

  // Stats
  process.stdout.write(`\nBusca cross-workspace concluída em ${result.stats.totalDurationMs}ms\n`)
  process.stdout.write(
    `  Workspaces: ${result.stats.workspacesSucceeded}/${result.stats.workspacesQueried} responderam\n`,
  )

  // Errors
  if (result.errors.length > 0) {
    process.stdout.write(`\n  Erros:\n`)
    for (const err of result.errors) {
      process.stdout.write(`    ⚠ ${err.workspaceName}: ${err.error} (${err.code})\n`)
    }
  }

  // Results
  if (result.results.length === 0) {
    process.stdout.write('\nNenhum resultado encontrado.\n')
    return
  }

  process.stdout.write(`\n${result.results.length} resultado(s) para: "${args.query}"\n\n`)

  for (const r of result.results) {
    const symbol = r.symbolName ? ` — ${r.symbolName}` : ''
    process.stdout.write(
      `  [${Math.round(r.score * 100)}%] [${r.workspaceName}] ${r.file}:${r.startLine}${symbol}\n`,
    )
    const preview = r.content.split('\n').slice(0, 3).join('\n')
    process.stdout.write(`    ${preview.replace(/\n/g, '\n    ')}\n\n`)
  }
}
