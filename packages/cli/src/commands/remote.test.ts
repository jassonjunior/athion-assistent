/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-function-type */
/**
 * Testes unitários para commands/remote.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockRepo = {
  owner: 'user',
  name: 'repo',
  localPath: '/home/.athion/repos/user/repo',
  branch: 'main',
}

vi.mock('@athion/core', () => ({
  cloneRepo: vi.fn(() => mockRepo),
  toRemoteInfo: vi.fn(() => ({ url: 'https://github.com/user/repo', branch: 'main' })),
  WorkspaceRegistry: vi.fn(() => ({
    addRemote: vi.fn(() => ({ id: 'ws-1' })),
  })),
  listRepos: vi.fn(() => [
    { owner: 'user', name: 'repo', localPath: '/home/.athion/repos/user/repo' },
  ]),
  removeRepo: vi.fn(),
  syncRepo: vi.fn(),
  cleanupStaleRepos: vi.fn(() => ['/path/removed-repo']),
}))

import { remoteCommand } from './remote.js'

describe('remoteCommand', () => {
  it('registra 5 subcomandos (add, list, remove, sync, cleanup)', () => {
    const mockYargs = {
      command: vi.fn().mockReturnThis(),
      demandCommand: vi.fn().mockReturnThis(),
    }

    remoteCommand(mockYargs as never)
    expect(mockYargs.command).toHaveBeenCalledTimes(5)
    expect(mockYargs.demandCommand).toHaveBeenCalledWith(1, expect.any(String))
  })
})

describe('remote handlers', () => {
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

    remoteCommand(mockYargs as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('add handler clona repositório e exibe info', async () => {
    await handlers['add']!({ url: 'https://github.com/user/repo', register: true })

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Clonando')
    expect(output).toContain('user')
    expect(output).toContain('repo')
    expect(output).toContain('Registrado como workspace')
  })

  it('add handler sem register não registra workspace', async () => {
    await handlers['add']!({ url: 'https://github.com/user/repo', register: false })

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).not.toContain('Registrado como workspace')
  })

  it('list handler exibe repositórios', async () => {
    await handlers['list']!()

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('user/repo')
  })

  it('list handler com lista vazia exibe mensagem', async () => {
    const { listRepos } = await import('@athion/core')
    ;(listRepos as ReturnType<typeof vi.fn>).mockReturnValueOnce([])

    await handlers['list']!()

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Nenhum repositório')
  })

  it('remove handler remove repositório', async () => {
    await handlers['remove']!({ path: '/path/repo' })

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('removido')
  })

  it('sync handler sincroniza repositório', async () => {
    await handlers['sync']!({ path: '/path/repo' })

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('atualizado')
  })

  it('sync handler exibe erro quando sincronização falha', async () => {
    const { syncRepo } = await import('@athion/core')
    ;(syncRepo as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error('sync failed')
    })

    await handlers['sync']!({ path: '/path/repo' })

    const errOutput = stderrSpy.mock.calls.map((c) => c[0]).join('')
    expect(errOutput).toContain('Erro')
    expect(errOutput).toContain('sync failed')
  })

  it('cleanup handler remove repos obsoletos', async () => {
    await handlers['cleanup']!({ days: 30 })

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('removido')
  })

  it('cleanup handler sem repos obsoletos exibe mensagem', async () => {
    const { cleanupStaleRepos } = await import('@athion/core')
    ;(cleanupStaleRepos as ReturnType<typeof vi.fn>).mockReturnValueOnce([])

    await handlers['cleanup']!({ days: 30 })

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Nenhum repositório obsoleto')
  })
})
