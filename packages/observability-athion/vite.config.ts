import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const host = process.env.TAURI_DEV_HOST

export default defineConfig({
  plugins: [react()],
  root: '.',
  server: {
    port: 3456,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 3456 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3457',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
