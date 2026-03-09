/**
 * esbuild config para o webview React (browser side).
 *
 * - Platform: browser
 * - Format: iife (single file, sem module loader)
 * - Bundla React + CSS em dist/webview/
 */

import { build } from 'esbuild'

const isWatch = process.argv.includes('--watch')

/** @type {import('esbuild').BuildOptions} */
const config = {
  entryPoints: ['src/webview/app/main.tsx'],
  bundle: true,
  outdir: 'dist/webview',
  entryNames: 'main',
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  loader: {
    '.css': 'css',
  },
  sourcemap: true,
  minify: !isWatch,
  logLevel: 'info',
}

if (isWatch) {
  const ctx = await (await import('esbuild')).context(config)
  await ctx.watch()
  console.log('[esbuild] Watching webview...')
} else {
  await build(config)
}
