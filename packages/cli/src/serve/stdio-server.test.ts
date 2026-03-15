/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Testes unitários para serve/stdio-server.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createStdioServer } from './stdio-server.js'

// ─── Mocks globais ─────────────────────────────────────────────────

function createMockCore() {
  return {
    config: {
      get: vi.fn(() => 'value'),
      set: vi.fn(),
      getAll: vi.fn(() => ({ key: 'value' })),
    },
    orchestrator: {
      chat: vi.fn(function* () {
        yield { type: 'content', content: 'ok' }
      }),
      createSession: vi.fn(async () => ({
        id: 'sid',
        projectId: 'p',
        title: 'T',
        createdAt: new Date().toISOString(),
      })),
      listSessions: vi.fn(() => []),
      loadSession: vi.fn(async (id: string) => ({
        id,
        projectId: 'p',
        title: 'T',
        createdAt: new Date().toISOString(),
      })),
      deleteSession: vi.fn(),
    },
    tools: { list: vi.fn(() => []) },
    subagents: { list: vi.fn(() => []) },
    skills: {
      list: vi.fn(() => []),
      get: vi.fn(),
      setActive: vi.fn(),
      clearActive: vi.fn(),
      getActive: vi.fn(() => null),
    },
    skillRegistry: {
      search: vi.fn(() => []),
      searchGitHub: vi.fn(async () => []),
      isInstalled: vi.fn(() => false),
      install: vi.fn(async () => ({ success: true })),
    },
    indexer: null,
    dependencyGraph: null,
    provider: { streamChat: vi.fn(function* () {}) },
    permissions: { grant: vi.fn() },
    bus: { subscribe: vi.fn() },
  }
}

describe('createStdioServer', () => {
  let core: ReturnType<typeof createMockCore>
  let stdoutSpy: ReturnType<typeof vi.spyOn>
  let stderrSpy: ReturnType<typeof vi.spyOn>
  let stdinOnSpy: ReturnType<typeof vi.spyOn>
  let stdinSetEncodingSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    core = createMockCore()
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    stdinOnSpy = vi.spyOn(process.stdin, 'on').mockImplementation(function (
      this: NodeJS.ReadStream,
    ) {
      return this
    })
    stdinSetEncodingSpy = vi.spyOn(process.stdin, 'setEncoding').mockImplementation(function (
      this: NodeJS.ReadStream,
    ) {
      return this
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna objeto com start e sendNotification', () => {
    const server = createStdioServer(core as never)
    expect(server).toHaveProperty('start')
    expect(server).toHaveProperty('sendNotification')
    expect(typeof server.start).toBe('function')
    expect(typeof server.sendNotification).toBe('function')
  })

  it('start configura stdin listeners', () => {
    const server = createStdioServer(core as never)
    server.start()

    expect(stdinSetEncodingSpy).toHaveBeenCalledWith('utf-8')
    expect(stdinOnSpy).toHaveBeenCalledWith('data', expect.any(Function))
    expect(stdinOnSpy).toHaveBeenCalledWith('end', expect.any(Function))
  })

  it('start loga "JSON-RPC stdio server ready" no stderr', () => {
    const server = createStdioServer(core as never)
    server.start()

    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('JSON-RPC stdio server ready'))
  })

  it('sendNotification escreve JSON-RPC notification no stdout', () => {
    const server = createStdioServer(core as never)
    server.sendNotification('chat.event', { type: 'content', content: 'hello' })

    expect(stdoutSpy).toHaveBeenCalled()
    const written = stdoutSpy.mock.calls[0]![0] as string
    const parsed = JSON.parse(written.trim())
    expect(parsed.jsonrpc).toBe('2.0')
    expect(parsed.method).toBe('chat.event')
    expect(parsed.params).toEqual({ type: 'content', content: 'hello' })
    expect(parsed).not.toHaveProperty('id')
  })

  it('sendNotification sem params omite campo params', () => {
    const server = createStdioServer(core as never)
    server.sendNotification('ping')

    const written = stdoutSpy.mock.calls[0]![0] as string
    const parsed = JSON.parse(written.trim())
    expect(parsed).not.toHaveProperty('params')
  })

  it('processa requisição JSON-RPC válida via data handler', async () => {
    const server = createStdioServer(core as never)
    server.start()

    // Pega o data handler registrado no stdin
    const dataHandler = stdinOnSpy.mock.calls.find((c) => c[0] === 'data')?.[1] as (
      chunk: string,
    ) => void

    const request = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) + '\n'
    dataHandler(request)

    // Aguarda o dispatch assíncrono
    await new Promise((r) => setTimeout(r, 50))

    // Deve ter escrito a resposta no stdout
    const calls = stdoutSpy.mock.calls
    const responseLine = calls.find((c) => {
      try {
        const parsed = JSON.parse((c[0] as string).trim())
        return parsed.id === 1
      } catch {
        return false
      }
    })

    expect(responseLine).toBeDefined()
    const response = JSON.parse((responseLine![0] as string).trim())
    expect(response.jsonrpc).toBe('2.0')
    expect(response.id).toBe(1)
    expect(response.result.pong).toBe(true)
  })

  it('retorna METHOD_NOT_FOUND para método inexistente', async () => {
    const server = createStdioServer(core as never)
    server.start()

    const dataHandler = stdinOnSpy.mock.calls.find((c) => c[0] === 'data')?.[1] as (
      chunk: string,
    ) => void

    const request = JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'metodo.invalido' }) + '\n'
    dataHandler(request)

    await new Promise((r) => setTimeout(r, 50))

    const calls = stdoutSpy.mock.calls
    const responseLine = calls.find((c) => {
      try {
        const parsed = JSON.parse((c[0] as string).trim())
        return parsed.id === 2
      } catch {
        return false
      }
    })

    expect(responseLine).toBeDefined()
    const response = JSON.parse((responseLine![0] as string).trim())
    expect(response.error).toBeDefined()
    expect(response.error.code).toBe(-32601)
  })

  it('ignora linhas vazias', async () => {
    const server = createStdioServer(core as never)
    server.start()

    const dataHandler = stdinOnSpy.mock.calls.find((c) => c[0] === 'data')?.[1] as (
      chunk: string,
    ) => void

    // Envia linhas vazias
    dataHandler('\n\n\n')

    await new Promise((r) => setTimeout(r, 50))

    // Nenhuma resposta deve ter sido escrita (exceto o log de ready)
    const responseWrites = stdoutSpy.mock.calls.filter((c) => {
      try {
        JSON.parse((c[0] as string).trim())
        return true
      } catch {
        return false
      }
    })
    expect(responseWrites.length).toBe(0)
  })

  it('lida com JSON mal-formado sem crash', async () => {
    const server = createStdioServer(core as never)
    server.start()

    const dataHandler = stdinOnSpy.mock.calls.find((c) => c[0] === 'data')?.[1] as (
      chunk: string,
    ) => void

    // Envia JSON inválido
    dataHandler('this is not json\n')

    await new Promise((r) => setTimeout(r, 50))

    // Deve ter logado o erro no stderr
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Parse error'))
  })

  it('acumula buffer para mensagens parciais', async () => {
    const server = createStdioServer(core as never)
    server.start()

    const dataHandler = stdinOnSpy.mock.calls.find((c) => c[0] === 'data')?.[1] as (
      chunk: string,
    ) => void

    // Envia mensagem em duas partes
    const fullMsg = JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'ping' })
    const half1 = fullMsg.slice(0, Math.floor(fullMsg.length / 2))
    const half2 = fullMsg.slice(Math.floor(fullMsg.length / 2)) + '\n'

    dataHandler(half1)

    await new Promise((r) => setTimeout(r, 20))

    // Nenhuma resposta ainda
    const beforeCalls = stdoutSpy.mock.calls.filter((c) => {
      try {
        const parsed = JSON.parse((c[0] as string).trim())
        return parsed.id === 3
      } catch {
        return false
      }
    })
    expect(beforeCalls.length).toBe(0)

    // Completa a mensagem
    dataHandler(half2)

    await new Promise((r) => setTimeout(r, 50))

    const afterCalls = stdoutSpy.mock.calls.filter((c) => {
      try {
        const parsed = JSON.parse((c[0] as string).trim())
        return parsed.id === 3
      } catch {
        return false
      }
    })
    expect(afterCalls.length).toBe(1)
  })
})
