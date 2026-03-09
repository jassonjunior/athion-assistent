/**
 * esbuild config para a extensão VS Code (Node.js side).
 *
 * - Platform: node (VS Code extension host)
 * - Format: cjs (VS Code exige CommonJS para o entry point)
 * - External: vscode (provido pelo VS Code runtime)
 */

import { build } from 'esbuild'

const isWatch = process.argv.includes('--watch')

/** @type {import('esbuild').BuildOptions} */
const config = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['vscode'],
  sourcemap: true,
  minify: !isWatch,
  logLevel: 'info',
}

if (isWatch) {
  const ctx = await (await import('esbuild')).context(config)
  await ctx.watch()
  console.log('[esbuild] Watching extension...')
} else {
  await build(config)
}
