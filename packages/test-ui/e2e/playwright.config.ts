/**
 * Playwright config para testes E2E do Chat App (test-ui).
 *
 * O servidor do test-ui é subido automaticamente antes dos testes
 * via `webServer` (apenas se não estiver rodando já).
 *
 * Instalar:
 *   bun add -d @playwright/test
 *   bunx playwright install chromium
 *
 * Executar:
 *   bun run test:e2e
 *   # ou: bunx playwright test e2e/
 *   # com modelo: ATHION_E2E_MODEL=1 bunx playwright test e2e/
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './',
  testMatch: '**/*.e2e.ts',
  testIgnore: ['**/helpers/**'],

  // Timeout por teste (sem modelo: 30s é suficiente)
  timeout: 30000,
  expect: { timeout: 10000 },

  // Em CI: retry automático; local: sem retry para feedback rápido
  retries: process.env['CI'] ? 2 : 0,
  workers: 1,
  fullyParallel: false,

  reporter: [['list'], ['html', { outputFolder: '../../e2e-reports/chat-app', open: 'never' }]],

  use: {
    baseURL: 'http://localhost:3457',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Sobe o servidor antes dos testes e para depois
  webServer: {
    command: 'bun run dev:server',
    url: 'http://localhost:3457',
    reuseExistingServer: !process.env['CI'],
    timeout: 30000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
