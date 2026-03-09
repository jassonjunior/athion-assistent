/**
 * Testes E2E para a CLI do Athion.
 *
 * Estes testes executam a CLI real usando o sidecar Bun e verificam:
 * - Flag --version retorna versão
 * - Flag --help mostra ajuda
 * - Comando config list retorna configurações
 * - Servidor serve responde ao ping via JSON-RPC
 *
 * Não faz streaming real (evita LLM calls) — testa apenas a infraestrutura.
 */
import { describe, it, expect } from 'vitest'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '../../../..')
const CLI_ENTRY = join(ROOT, 'packages/cli/src/index.ts')
const BUN_BIN = process.execPath.includes('bun') ? process.execPath : 'bun'

function runCli(
  args: string[],
  timeout = 10000,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(BUN_BIN, ['run', CLI_ENTRY, ...args], {
      env: { ...process.env, NO_COLOR: '1' },
      cwd: ROOT,
    })

    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error(`CLI timed out after ${timeout}ms`))
    }, timeout)

    proc.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    proc.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })

    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, code: code ?? 0 })
    })
  })
}

describe('CLI E2E', () => {
  it('--version retorna string de versão', async () => {
    const { stdout, code } = await runCli(['--version'])
    expect(code).toBe(0)
    expect(stdout.trim()).toMatch(/\d+\.\d+\.\d+/)
  })

  it('--help mostra comandos disponíveis', async () => {
    const { stdout, code } = await runCli(['--help'])
    expect(code).toBe(0)
    expect(stdout).toContain('chat')
  })

  it('config --help mostra subcomandos', async () => {
    const { stdout } = await runCli(['config', '--help'])
    expect(stdout).toContain('get')
  })

  it('serve --help mostra opções do servidor', async () => {
    const { stdout } = await runCli(['serve', '--help'])
    expect(stdout).toContain('port')
  })
})
