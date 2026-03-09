/**
 * WebdriverIO config para testes E2E do Desktop App (Tauri 2.x).
 *
 * Usa tauri-driver como WebDriver server para controlar o app nativo.
 * O tauri-driver é iniciado automaticamente nos hooks onPrepare/onComplete.
 *
 * Instalar dependências:
 *   cargo install tauri-driver
 *   bun add -d @wdio/cli @wdio/local-runner @wdio/mocha-framework
 *   bun add -d @wdio/spec-reporter @wdio/json-reporter
 *
 * Executar:
 *   bun run test:e2e
 *   # ou: bunx wdio run e2e/wdio.conf.ts
 *
 * Plataformas:
 *   macOS  → src-tauri/target/release/bundle/macos/athion-desktop.app
 *   Linux  → src-tauri/target/release/athion-desktop
 *   Win    → src-tauri/target/release/athion-desktop.exe
 */
import { resolve } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import type { Options } from '@wdio/types'

const DESKTOP_ROOT = resolve(import.meta.dirname, '..')
const ROOT = resolve(DESKTOP_ROOT, '../..')

function getAppPath(): string {
  switch (process.platform) {
    case 'darwin':
      return resolve(DESKTOP_ROOT, 'src-tauri/target/release/bundle/macos/athion-desktop.app')
    case 'win32':
      return resolve(DESKTOP_ROOT, 'src-tauri/target/release/athion-desktop.exe')
    default:
      return resolve(DESKTOP_ROOT, 'src-tauri/target/release/athion-desktop')
  }
}

let tauriDriver: ChildProcess | null = null

export const config: Options.Testrunner = {
  // tauri-driver escuta em 127.0.0.1:4444 por padrão
  hostname: '127.0.0.1',
  port: 4444,
  path: '/',

  specs: [resolve(import.meta.dirname, '**/*.e2e.ts')],
  exclude: [resolve(import.meta.dirname, 'helpers/**')],

  maxInstances: 1,

  capabilities: [
    {
      maxInstances: 1,
      'tauri:options': {
        application: getAppPath(),
      },
    },
  ],

  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
    require: ['ts-node/register'],
  },

  reporters: [
    ['spec', { addConsoleLogs: false }],
    ['json', { outputDir: resolve(ROOT, 'e2e-reports/desktop') }],
  ],

  // ─── Lifecycle hooks ────────────────────────────────────────────

  onPrepare: async () => {
    // Inicia tauri-driver antes de criar a sessão WebDriver
    tauriDriver = spawn('tauri-driver', [], {
      stdio: 'inherit',
      env: { ...process.env },
    })
    // Aguarda o driver subir
    await new Promise<void>((resolve) => setTimeout(resolve, 2000))
  },

  onComplete: () => {
    tauriDriver?.kill('SIGTERM')
    tauriDriver = null
  },
}
