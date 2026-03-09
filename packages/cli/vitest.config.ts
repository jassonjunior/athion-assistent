import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts', 'src/**/*.e2e.test.ts'],
    // E2E tests spawnam processos externos — timeout generoso
    testTimeout: 90000,
    hookTimeout: 40000,
    server: {
      deps: {
        inline: ['zod'],
      },
    },
  },
})
