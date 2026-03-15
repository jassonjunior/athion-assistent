/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-function-type */
/**
 * Testes unitários para commands/codebase.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockIndexer = {
  indexWorkspace: vi.fn(async (cb?: Function) => {
    cb?.(1, 5, '/workspace/src/file.ts')
    cb?.(5, 5, '/workspace/src/last.ts')
    return { totalFiles: 5, totalChunks: 20, hasVectors: true }
  }),
  search: vi.fn(async () => [
    {
      chunk: {
        filePath: '/workspace/src/auth.ts',
        startLine: 10,
        endLine: 25,
        language: 'typescript',
        symbolName: 'authenticate',
        chunkType: 'function',
        content: 'function authenticate() {\n  // code\n  return true;\n}',
      },
      score: 0.92,
      source: 'bm25',
    },
  ]),
  getStats: vi.fn(() => ({
    totalFiles: 5,
    totalChunks: 20,
    hasVectors: true,
    workspacePath: '/workspace',
    indexedAt: new Date('2024-01-01'),
  })),
  clear: vi.fn(),
  close: vi.fn(),
}

vi.mock('@athion/core', () => ({
  createCodebaseIndexer: vi.fn(() => mockIndexer),
}))

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/user'),
}))

import { codebaseCommand } from './codebase.js'

describe('codebaseCommand', () => {
  it('registra subcomandos index, search, status e clear', () => {
    const mockYargs = {
      command: vi.fn().mockReturnThis(),
      demandCommand: vi.fn().mockReturnThis(),
    }

    codebaseCommand(mockYargs as never)
    expect(mockYargs.command).toHaveBeenCalledTimes(4)
    expect(mockYargs.demandCommand).toHaveBeenCalledWith(1, expect.any(String))
  })
})

describe('codebase handlers', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let handlers: Record<string, Function>

  beforeEach(() => {
    vi.clearAllMocks()
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    handlers = {}

    const mockYargs = {
      command: vi.fn(function (
        this: unknown,
        name: string,
        _desc: string,
        _builder: unknown,
        handler?: Function,
      ) {
        if (handler) handlers[name.split(' ')[0]!] = handler
        return this
      }),
      demandCommand: vi.fn().mockReturnThis(),
    }

    codebaseCommand(mockYargs as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('index handler indexa e exibe resultado', async () => {
    await handlers['index']!({ path: '.', db: undefined })

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Indexando')
    expect(output).toContain('concluída')
    expect(output).toContain('5')
    expect(output).toContain('20')
    expect(mockIndexer.close).toHaveBeenCalled()
  })

  it('search handler busca e exibe resultados', async () => {
    await handlers['search']!({ query: 'authenticate', limit: 8, db: undefined })

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('authenticate')
    expect(output).toContain('92%')
    expect(mockIndexer.close).toHaveBeenCalled()
  })

  it('search handler exibe mensagem quando sem resultados', async () => {
    mockIndexer.search.mockResolvedValueOnce([])
    await handlers['search']!({ query: 'nada', limit: 8, db: undefined })

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Nenhum resultado')
  })

  it('status handler exibe estatísticas do índice', async () => {
    await handlers['status']!({ db: undefined })

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Estatísticas')
    expect(output).toContain('5')
    expect(output).toContain('20')
    expect(mockIndexer.close).toHaveBeenCalled()
  })

  it('status handler exibe mensagem quando índice vazio', async () => {
    mockIndexer.getStats.mockReturnValueOnce({ totalChunks: 0, totalFiles: 0 })
    await handlers['status']!({ db: undefined })

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('vazio')
  })

  it('clear handler limpa o índice', async () => {
    await handlers['clear']!({ db: undefined })

    expect(mockIndexer.clear).toHaveBeenCalled()
    expect(mockIndexer.close).toHaveBeenCalled()
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('limpo')
  })
})
