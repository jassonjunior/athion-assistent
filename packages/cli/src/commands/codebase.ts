/**
 * Comando `athion codebase` — Indexação e busca semântica do codebase.
 *
 * Subcomandos:
 *   index [path]      — Indexa o workspace (ou um path específico)
 *   search <query>    — Busca semanticamente no índice
 *   status            — Mostra estatísticas do índice
 *   clear             — Remove todos os dados do índice
 *
 * Exemplos:
 *   athion codebase index .
 *   athion codebase search "função de autenticação JWT"
 *   athion codebase status
 */

import { resolve } from 'node:path'
import type { ArgumentsCamelCase, Argv } from 'yargs'

export function codebaseCommand(yargs: Argv) {
  return yargs
    .command(
      'index [path]',
      'Indexa o codebase para busca semântica',
      (y: Argv) =>
        y
          .positional('path', {
            type: 'string',
            default: '.',
            describe: 'Diretório a indexar (default: diretório atual)',
          })
          .option('db', {
            type: 'string',
            describe: 'Caminho do banco de dados do índice',
          }),
      codebaseIndexHandler as never,
    )
    .command(
      'search <query>',
      'Busca semanticamente no índice do codebase',
      (y: Argv) =>
        y
          .positional('query', { type: 'string', demandOption: true })
          .option('limit', { type: 'number', default: 8, describe: 'Máximo de resultados' })
          .option('db', { type: 'string', describe: 'Caminho do banco de dados do índice' }),
      codebaseSearchHandler as never,
    )
    .command(
      'status',
      'Mostra estatísticas do índice',
      (y: Argv) => y.option('db', { type: 'string', describe: 'Caminho do banco de dados' }),
      codebaseStatusHandler as never,
    )
    .command(
      'clear',
      'Remove todos os dados do índice',
      (y: Argv) => y.option('db', { type: 'string', describe: 'Caminho do banco de dados' }),
      codebaseClearHandler as never,
    )
    .demandCommand(1, 'Especifique um subcomando: index, search, status, clear')
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function codebaseIndexHandler(
  args: ArgumentsCamelCase<{ path: string; db?: string }>,
): Promise<void> {
  const { createCodebaseIndexer } = await import('@athion/core')
  const { homedir } = await import('node:os')
  const { join } = await import('node:path')

  const workspacePath = resolve(args.path ?? '.')
  const dbPath = args.db ?? join(homedir(), '.athion', 'index.db')

  const indexer = createCodebaseIndexer({
    workspacePath,
    dbPath,
    embeddingBaseUrl: process.env['ATHION_EMBEDDING_URL'] ?? '',
    embeddingModel: process.env['ATHION_EMBEDDING_MODEL'] ?? 'nomic-embed-text',
  })

  process.stdout.write(`Indexando: ${workspacePath}\n`)
  process.stdout.write(`Banco: ${dbPath}\n\n`)

  let lastProgress = 0
  const stats = await indexer.indexWorkspace((indexed, total, currentFile) => {
    const pct = Math.floor((indexed / Math.max(total, 1)) * 100)
    if (pct >= lastProgress + 10 || indexed === total) {
      const relFile = currentFile.replace(workspacePath, '').slice(1)
      process.stdout.write(`  [${pct}%] ${indexed}/${total} — ${relFile}\n`)
      lastProgress = pct
    }
  })

  indexer.close()

  process.stdout.write('\nIndexação concluída!\n')
  process.stdout.write(`  Arquivos : ${stats.totalFiles}\n`)
  process.stdout.write(`  Chunks   : ${stats.totalChunks}\n`)
  process.stdout.write(
    `  Vetores  : ${stats.hasVectors ? 'sim' : 'não (configure ATHION_EMBEDDING_URL)'}\n`,
  )
}

async function codebaseSearchHandler(
  args: ArgumentsCamelCase<{ query: string; limit: number; db?: string }>,
): Promise<void> {
  const { createCodebaseIndexer } = await import('@athion/core')
  const { homedir } = await import('node:os')
  const { join } = await import('node:path')

  const workspacePath = process.cwd()
  const dbPath = args.db ?? join(homedir(), '.athion', 'index.db')

  const indexer = createCodebaseIndexer({ workspacePath, dbPath })

  const results = await indexer.search(args.query, args.limit)
  indexer.close()

  if (results.length === 0) {
    process.stdout.write('Nenhum resultado encontrado.\n')
    process.stdout.write(
      'Dica: execute `athion codebase index .` primeiro para indexar o codebase.\n',
    )
    return
  }

  process.stdout.write(`\n${results.length} resultado(s) para: "${args.query}"\n\n`)

  for (const r of results) {
    const relPath = r.chunk.filePath.replace(workspacePath, '').slice(1)
    const symbol = r.chunk.symbolName ? ` — ${r.chunk.symbolName}` : ''
    process.stdout.write(
      `  [${Math.round(r.score * 100)}%] ${relPath}:${r.chunk.startLine}${symbol}\n`,
    )
    // Mostra primeiras 3 linhas do chunk
    const preview = r.chunk.content.split('\n').slice(0, 3).join('\n')
    process.stdout.write(`    ${preview.replace(/\n/g, '\n    ')}\n\n`)
  }
}

async function codebaseStatusHandler(args: ArgumentsCamelCase<{ db?: string }>): Promise<void> {
  const { createCodebaseIndexer } = await import('@athion/core')
  const { homedir } = await import('node:os')
  const { join } = await import('node:path')

  const dbPath = args.db ?? join(homedir(), '.athion', 'index.db')
  const indexer = createCodebaseIndexer({ workspacePath: process.cwd(), dbPath })
  const stats = indexer.getStats()
  indexer.close()

  if (stats.totalChunks === 0) {
    process.stdout.write('Índice vazio. Execute `athion codebase index <path>` primeiro.\n')
    return
  }

  process.stdout.write('\nEstatísticas do índice:\n')
  process.stdout.write(`  Workspace : ${stats.workspacePath}\n`)
  process.stdout.write(`  Arquivos  : ${stats.totalFiles}\n`)
  process.stdout.write(`  Chunks    : ${stats.totalChunks}\n`)
  process.stdout.write(`  Vetores   : ${stats.hasVectors ? 'sim' : 'não'}\n`)
  process.stdout.write(
    `  Indexado  : ${stats.indexedAt ? stats.indexedAt.toLocaleString('pt-BR') : 'nunca'}\n`,
  )
}

async function codebaseClearHandler(args: ArgumentsCamelCase<{ db?: string }>): Promise<void> {
  const { createCodebaseIndexer } = await import('@athion/core')
  const { homedir } = await import('node:os')
  const { join } = await import('node:path')

  const dbPath = args.db ?? join(homedir(), '.athion', 'index.db')
  const indexer = createCodebaseIndexer({ workspacePath: process.cwd(), dbPath })
  indexer.clear()
  indexer.close()

  process.stdout.write('Índice limpo com sucesso.\n')
}
