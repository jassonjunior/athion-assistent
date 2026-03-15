/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-unused-vars */
/**
 * Testes unitários para commands/config.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mock do bootstrap ─────────────────────────────────────────────

const mockCore = {
  config: {
    getAll: vi.fn(() => ({
      model: 'gpt-4',
      provider: 'openai',
      theme: 'default',
    })),
    get: vi.fn((key: string) => {
      const map: Record<string, unknown> = { model: 'gpt-4', provider: 'openai' }
      return map[key] ?? null
    }),
    set: vi.fn(),
  },
}

vi.mock('@athion/core', () => ({
  bootstrap: vi.fn(async () => mockCore),
}))

import { configCommand } from './config.js'

describe('configCommand', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('registra subcomandos list, get e set no yargs', () => {
    const mockYargs = {
      command: vi.fn().mockReturnThis(),
      demandCommand: vi.fn().mockReturnThis(),
    }

    configCommand(mockYargs as never)

    // Deve ter registrado 3 commands
    expect(mockYargs.command).toHaveBeenCalledTimes(3)
    expect(mockYargs.command).toHaveBeenCalledWith(
      'list',
      expect.any(String),
      expect.any(Object),
      expect.any(Function),
    )
    expect(mockYargs.command).toHaveBeenCalledWith(
      'get <key>',
      expect.any(String),
      expect.any(Function),
      expect.any(Function),
    )
    expect(mockYargs.command).toHaveBeenCalledWith(
      'set <key> <value>',
      expect.any(String),
      expect.any(Function),
      expect.any(Function),
    )
  })

  it('demandCommand exige pelo menos 1 subcomando', () => {
    const mockYargs = {
      command: vi.fn().mockReturnThis(),
      demandCommand: vi.fn().mockReturnThis(),
    }

    configCommand(mockYargs as never)
    expect(mockYargs.demandCommand).toHaveBeenCalledWith(1, expect.any(String))
  })
})

describe('config handlers via yargs', () => {
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

    configCommand(mockYargs as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('list handler exibe todas as configurações', async () => {
    await handlers['list']!()

    expect(mockCore.config.getAll).toHaveBeenCalled()
    // Deve ter escrito cada configuração no stdout
    expect(stdoutSpy).toHaveBeenCalled()
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('model')
    expect(output).toContain('gpt-4')
  })

  it('get handler exibe valor de uma chave', async () => {
    await handlers['get']!({ key: 'model' })

    expect(mockCore.config.get).toHaveBeenCalledWith('model')
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('gpt-4')
  })

  it('set handler define valor string', async () => {
    await handlers['set']!({ key: 'model', value: 'gpt-3.5' })

    expect(mockCore.config.set).toHaveBeenCalledWith('model', 'gpt-3.5')
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('model')
  })

  it('set handler parseia "true" como boolean', async () => {
    await handlers['set']!({ key: 'debug', value: 'true' })
    expect(mockCore.config.set).toHaveBeenCalledWith('debug', true)
  })

  it('set handler parseia "false" como boolean', async () => {
    await handlers['set']!({ key: 'debug', value: 'false' })
    expect(mockCore.config.set).toHaveBeenCalledWith('debug', false)
  })

  it('set handler parseia número como Number', async () => {
    await handlers['set']!({ key: 'maxTokens', value: '4096' })
    expect(mockCore.config.set).toHaveBeenCalledWith('maxTokens', 4096)
  })
})
