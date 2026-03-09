/**
 * Comando `athion serve` — Servidor IPC para extensão VS Code e app desktop.
 *
 * Dois modos:
 *   --mode=stdio  → JSON-RPC 2.0 sobre stdin/stdout (usado pela extensão VS Code)
 *   --mode=http   → HTTP + WebSocket server (futuro, para app desktop)
 *
 * Default: stdio (principal uso é a extensão VS Code).
 */

import type { Argv } from 'yargs'

export function serveCommand(yargs: Argv) {
  return yargs
    .option('mode', {
      alias: 'm',
      type: 'string',
      choices: ['stdio', 'http'] as const,
      default: 'stdio',
      describe: 'Modo do servidor: stdio (JSON-RPC) ou http',
    })
    .option('port', {
      alias: 'p',
      type: 'number',
      default: 3000,
      describe: 'Porta do servidor HTTP (modo http)',
    })
}

export async function serveHandler(args: { mode: string; port: number }) {
  const { bootstrap } = await import('@athion/core')
  const { resolve } = await import('node:path')

  if (args.mode === 'http') {
    process.stderr.write(`\n  HTTP mode will be implemented in Fase 5 (Desktop).\n`)
    process.stderr.write(`  Port: ${args.port}\n\n`)
    return
  }

  // Stdio mode: JSON-RPC 2.0 over stdin/stdout
  const core = await bootstrap({
    skillsDir: resolve(import.meta.dir, '../../core/skills'),
  })

  const { createStdioServer } = await import('../serve/stdio-server.js')
  const server = createStdioServer(core)
  server.start()
}
