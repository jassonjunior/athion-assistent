/**
 * Comando `athion mcp` — Inicia servidor MCP para exposição do Codebase Intelligence.
 * Descrição: Conecta o Athion a clientes MCP como Claude Code, Cursor, etc.
 *
 * Uso:
 *   athion mcp                       # Inicia MCP via stdio (padrão)
 *   athion mcp --transport sse       # Inicia MCP via SSE
 *   athion mcp --port 3100           # SSE em porta específica
 *
 * O servidor expõe 7 tools e 5 resources do Codebase Intelligence.
 */

import { resolve } from 'node:path'
import type { ArgumentsCamelCase, Argv } from 'yargs'

/** mcpCommand
 * Descrição: Configura as opções do comando mcp no yargs.
 */
export function mcpCommand(yargs: Argv) {
  return yargs
    .option('transport', {
      type: 'string',
      choices: ['stdio', 'sse'] as const,
      default: 'stdio',
      describe: 'Transporte MCP: stdio (Claude Code) ou sse (HTTP)',
    })
    .option('port', {
      type: 'number',
      default: 3100,
      describe: 'Porta do servidor SSE (ignorada para stdio)',
    })
    .option('workspace', {
      type: 'string',
      default: '.',
      describe: 'Diretório do workspace a expor via MCP',
    })
}

/** mcpHandler
 * Descrição: Handler do comando athion mcp. Cria indexer + graph e inicia o servidor MCP.
 */
export async function mcpHandler(
  args: ArgumentsCamelCase<{ transport: string; port: number; workspace: string }>,
): Promise<void> {
  const { createCodebaseIndexer, createMcpServer, DependencyGraph } = await import('@athion/core')
  const { createBus } = await import('@athion/core')
  const { homedir } = await import('node:os')
  const { join } = await import('node:path')

  const workspacePath = resolve(args.workspace)

  // Per-workspace index DB
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(workspacePath)
  const hash = hasher.digest('hex').slice(0, 8)
  const dbPath = join(homedir(), '.athion', `index-${hash}.db`)

  const bus = createBus()
  const indexer = createCodebaseIndexer({ workspacePath, dbPath })
  const graph = new DependencyGraph()

  const transport = args.transport as 'stdio' | 'sse'

  if (transport === 'stdio') {
    // stdio — sem output para stderr (MCP usa stdio puro)
    const mcpServer = createMcpServer({
      indexer,
      graph,
      bus,
      transport: 'stdio',
    })

    await mcpServer.start()

    // Mantém o processo vivo
    process.on('SIGINT', async () => {
      await mcpServer.close()
      await indexer.close()
      process.exit(0)
    })
  } else {
    // SSE — log para stderr (stdout é livre para SSE)
    process.stderr.write(`[athion-mcp] Starting SSE server on port ${args.port}\n`)
    process.stderr.write(`[athion-mcp] Workspace: ${workspacePath}\n`)
    process.stderr.write(`[athion-mcp] Index DB: ${dbPath}\n`)

    const mcpServer = createMcpServer({
      indexer,
      graph,
      bus,
      transport: 'sse',
      ssePort: args.port,
    })

    await mcpServer.start()

    process.stderr.write(`[athion-mcp] MCP SSE server running on port ${args.port}\n`)
    process.stderr.write(`[athion-mcp] Press Ctrl+C to stop\n`)

    process.on('SIGINT', async () => {
      await mcpServer.close()
      await indexer.close()
      process.exit(0)
    })
  }
}
