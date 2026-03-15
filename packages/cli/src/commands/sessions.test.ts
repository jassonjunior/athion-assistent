/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-function-type */
/**
 * Testes unitários para commands/sessions.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockCore = {
  orchestrator: {
    listSessions: vi.fn(() => [
      { id: 'sess-1', projectId: 'p1', title: 'Session 1', createdAt: '2024-01-01T00:00:00Z' },
      { id: 'sess-2', projectId: 'p2', title: null, createdAt: '2024-01-02T00:00:00Z' },
    ]),
    deleteSession: vi.fn(),
  },
}

vi.mock('@athion/core', () => ({
  bootstrap: vi.fn(async () => mockCore),
}))

import { sessionsCommand } from './sessions.js'

describe('sessionsCommand', () => {
  it('registra subcomandos list e delete', () => {
    const mockYargs = {
      command: vi.fn().mockReturnThis(),
      demandCommand: vi.fn().mockReturnThis(),
    }

    sessionsCommand(mockYargs as never)
    expect(mockYargs.command).toHaveBeenCalledTimes(2)
    expect(mockYargs.demandCommand).toHaveBeenCalledWith(1, expect.any(String))
  })
})

describe('sessions handlers', () => {
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

    sessionsCommand(mockYargs as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('list exibe sessões formatadas', async () => {
    await handlers['list']!()

    expect(mockCore.orchestrator.listSessions).toHaveBeenCalled()
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('sess-1')
    expect(output).toContain('Session 1')
    expect(output).toContain('Sem título')
  })

  it('list com lista vazia exibe mensagem', async () => {
    mockCore.orchestrator.listSessions.mockReturnValueOnce([])
    await handlers['list']!()

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('Nenhuma sessão encontrada')
  })

  it('delete chama orchestrator.deleteSession', async () => {
    await handlers['delete']!({ id: 'sess-1' })

    expect(mockCore.orchestrator.deleteSession).toHaveBeenCalledWith('sess-1')
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('sess-1')
    expect(output).toContain('deletada')
  })
})
