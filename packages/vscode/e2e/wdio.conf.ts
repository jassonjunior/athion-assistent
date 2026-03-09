/**
 * WebdriverIO config para testes E2E da extensão VS Code.
 *
 * Usa wdio-vscode-service que baixa e provisiona o VS Code automaticamente,
 * instala a extensão em desenvolvimento e roda os testes.
 *
 * Instalar dependências (no pacote vscode):
 *   bun add -d @wdio/cli @wdio/local-runner @wdio/mocha-framework
 *   bun add -d @wdio/spec-reporter wdio-vscode-service
 *
 * Executar:
 *   bun run test:e2e
 *   # ou: bunx wdio run e2e/wdio.conf.ts
 */
import { resolve } from 'node:path'
import type { Options } from '@wdio/types'

const VSCODE_ROOT = resolve(import.meta.dirname, '..')
const ROOT = resolve(VSCODE_ROOT, '../..')

export const config: Options.Testrunner = {
  runner: 'local',

  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      project: resolve(VSCODE_ROOT, 'tsconfig.json'),
      transpileOnly: true,
    },
  },

  specs: [resolve(import.meta.dirname, '**/*.e2e.ts')],
  exclude: [resolve(import.meta.dirname, 'helpers/**')],

  maxInstances: 1,

  capabilities: [
    {
      browserName: 'vscode',
      browserVersion: 'stable',
      'wdio:vscodeOptions': {
        // Diretório raiz da extensão (contém o package.json com "main")
        extensionPath: VSCODE_ROOT,
        // Workspace aberto durante os testes
        workspacePath: ROOT,
        verboseLogging: false,
      },
    },
  ],

  // wdio-vscode-service provisiona VS Code automaticamente
  services: ['vscode'],

  framework: 'mocha',
  mochaOpts: {
    ui: 'bdd',
    timeout: 120000,
  },

  reporters: [
    ['spec', { addConsoleLogs: false }],
    ['json', { outputDir: resolve(ROOT, 'e2e-reports/vscode') }],
  ],

  beforeSuite: async () => {
    // Aguarda VS Code inicializar completamente após abrir
    await browser.pause(3000)
  },

  afterSuite: async () => {
    await browser.pause(500)
  },
}
