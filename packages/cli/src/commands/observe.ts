/**
 * Comando `athion observe` — Abre o painel de observabilidade.
 * Descrição: Abre o app desktop Athion Flow Observer (Tauri).
 * Se o app não estiver buildado, inicia o servidor e abre no browser como fallback.
 *
 * Opções:
 *   --port, -p  → Porta do servidor (default: 3457)
 *   --no-open   → Não abrir automaticamente
 *   --browser   → Forçar abertura no browser ao invés do app desktop
 */

import type { Argv } from 'yargs'

export interface ObserveArgs {
  port: number
  open: boolean
  browser: boolean
}

export function observeCommand(yargs: Argv) {
  return yargs
    .option('port', {
      alias: 'p',
      type: 'number',
      default: 3457,
      describe: 'Porta do servidor de observabilidade',
    })
    .option('open', {
      type: 'boolean',
      default: true,
      describe: 'Abrir automaticamente',
    })
    .option('browser', {
      alias: 'b',
      type: 'boolean',
      default: false,
      describe: 'Abrir no browser ao inves do app desktop',
    })
}

export async function observeHandler(args: ObserveArgs) {
  const { spawn } = await import('node:child_process')
  const { resolve } = await import('node:path')
  const { existsSync } = await import('node:fs')
  const { platform } = await import('node:os')

  if (!args.open) return

  const appPath = resolve(
    import.meta.dir,
    '../../../observability-athion/src-tauri/target/release/bundle/macos/Athion Flow Observer.app',
  )

  // Tentar abrir app desktop Tauri
  if (!args.browser && existsSync(appPath)) {
    process.stderr.write('\n  Abrindo Athion Flow Observer...\n\n')
    spawn('open', ['-a', appPath], { stdio: 'ignore', detached: true }).unref()
    return
  }

  // Fallback: iniciar servidor e abrir browser
  const serverEntry = resolve(import.meta.dir, '../../../observability-athion/src/server/index.ts')
  const url = `http://localhost:${args.port}`

  process.stderr.write(`\n  Iniciando Athion Flow Observer na porta ${args.port}...\n\n`)

  const child = spawn('bun', [serverEntry], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PORT: String(args.port) },
  })

  child.stdout?.on('data', (data: Buffer) => {
    process.stderr.write(data)
  })

  child.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(data)
  })

  child.on('error', (err) => {
    process.stderr.write(`  Erro ao iniciar servidor: ${err.message}\n`)
    process.exit(1)
  })

  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      process.stderr.write(`  Servidor encerrou com codigo ${code}\n`)
    }
    process.exit(code ?? 0)
  })

  // Aguardar servidor e abrir browser
  const os = platform()
  const openCmd = os === 'darwin' ? 'open' : os === 'win32' ? 'start' : 'xdg-open'

  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) {
        spawn(openCmd, [url], { stdio: 'ignore', detached: true }).unref()
        break
      }
    } catch {
      // servidor ainda não está pronto
    }
    await new Promise((r) => setTimeout(r, 500))
  }

  process.on('SIGINT', () => {
    child.kill('SIGTERM')
  })
  process.on('SIGTERM', () => {
    child.kill('SIGTERM')
  })
}
