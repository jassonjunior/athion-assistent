/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-function-type */
/**
 * Testes unitários para commands/workspace.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockRegistry = {
  add: vi.fn(() => ({
    id: 'ws-1',
    name: 'Projeto A',
    path: '/workspace/projeto-a',
    indexDbPath: '/home/.athion/workspaces/ws-1.db',
  })),
  list: vi.fn(() => [
    {
      id: 'ws-1',
      name: 'Projeto A',
      path: '/workspace/projeto-a',
      isActive: true,
      remote: null,
      lastIndexed: '2024-01-01',
    },
    {
      id: 'ws-2',
      name: 'Projeto B',
      path: '/workspace/projeto-b',
      isActive: false,
      remote: { url: 'https://github.com/user/repo' },
      lastIndexed: 'nunca',
    },
  ]),
  remove: vi.fn((id: string) => id === 'ws-1'),
}

const mockCrossSearch = vi.fn(async () => ({
  results: [
    {
      file: 'src/auth.ts',
      startLine: 5,
      score: 0.9,
      symbolName: 'login',
      content: 'function login() {\n  return true;\n}',
      workspaceName: 'Projeto A',
    },
  ],
  errors: [],
  stats: { totalDurationMs: 150, workspacesSucceeded: 2, workspacesQueried: 2 },
}))

vi.mock('@athion/core', () => ({
  WorkspaceRegistry: vi.fn(() => mockRegistry),
  crossWorkspaceSearch: (...args: unknown[]) => mockCrossSearch(...args),
}))

import { workspaceCommand } from './workspace.js'

describe('workspaceCommand', () => {
  it('registra 4 subcomandos (add, list, remove, search)', () => {
    const mockYargs = {
      command: vi.fn().mockReturnThis(),
      demandCommand: vi.fn().mockReturnThis(),
    }

    workspaceCommand(mockYargs as never)
    expect(mockYargs.command).toHaveBeenCalledTimes(4)
    expect(mockYargs.demandCommand).toHaveBeenCalledWith(1, expect.any(String))
  })
})

describe('workspace handlers', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>
  let handlers: Record<string, Function>

  beforeEach(() => {
    vi.clearAllMocks()
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
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

    workspaceCommand(mockYargs as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('add handler registra workspace e exibe info', async () => {
    await handlers['add']!({ path: './projeto-a', name: 'Projeto A' })

    expect(mockRegistry.add).toHaveBeenCalled()
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('registrado')
    expect(output).toContain('ws-1')
    expect(output).toContain('Projeto A')
  })

  it('add handler exibe erro quando add falha', async () => {
    mockRegistry.add.mockImplementationOnce(() => {
      throw new Error('Path não encontrado')
    })

    await handlers['add']!({ path: './inexistente' })

    const errOutput = stderrSpy.mock.calls.map((c) => c[0]).join('')
    expect(errOutput).toContain('Erro')
    expect(errOutput).toContain('Path não encontrado')
  })

  it('list handler exibe workspaces formatados', async () => {
    await handlers['list']!()

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('ws-1')
    expect(output).toContain('Projeto A')
    expect(output).toContain('ws-2')
    expect(output).toContain('remoto')
  })

  it('list handler exibe mensagem quando lista vazia', async () => {
    mockRegistry.list.mockReturnValueOnce([])

    await handlers['list']!()

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Nenhum workspace')
  })

  it('remove handler remove workspace existente', async () => {
    await handlers['remove']!({ id: 'ws-1' })

    expect(mockRegistry.remove).toHaveBeenCalledWith('ws-1')
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('removido')
  })

  it('remove handler exibe erro para workspace inexistente', async () => {
    await handlers['remove']!({ id: 'ws-99' })

    const errOutput = stderrSpy.mock.calls.map((c) => c[0]).join('')
    expect(errOutput).toContain('não encontrado')
  })

  it('search handler busca e exibe resultados cross-workspace', async () => {
    await handlers['search']!({ query: 'login', limit: 10, timeout: 5000 })

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('login')
    expect(output).toContain('Projeto A')
    expect(output).toContain('150ms')
  })

  it('search handler sem resultados exibe mensagem', async () => {
    mockCrossSearch.mockResolvedValueOnce({
      results: [],
      errors: [],
      stats: { totalDurationMs: 50, workspacesSucceeded: 1, workspacesQueried: 1 },
    })

    await handlers['search']!({ query: 'xyz', limit: 10, timeout: 5000 })

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Nenhum resultado')
  })

  it('search handler exibe erros de workspaces', async () => {
    mockCrossSearch.mockResolvedValueOnce({
      results: [],
      errors: [{ workspaceName: 'Projeto C', error: 'Timeout', code: 'TIMEOUT' }],
      stats: { totalDurationMs: 5000, workspacesSucceeded: 0, workspacesQueried: 1 },
    })

    await handlers['search']!({ query: 'test', limit: 10, timeout: 5000 })

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Projeto C')
    expect(output).toContain('Timeout')
  })

  it('search handler com workspaces específicos passa IDs', async () => {
    await handlers['search']!({ query: 'test', limit: 10, timeout: 5000, workspaces: 'ws-1,ws-2' })

    expect(mockCrossSearch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        workspaces: ['ws-1', 'ws-2'],
      }),
    )
  })
})
