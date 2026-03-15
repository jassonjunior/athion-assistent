/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
  execFileSync: vi.fn(),
}))

// Mock node:fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
}))

// Mock node:os
vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}))

// Mock protocol
vi.mock('./protocol.js', () => ({
  isResponse: (msg: { id?: unknown }) => typeof msg.id === 'number',
  isNotification: (msg: { id?: unknown; method?: unknown }) =>
    msg.id === undefined && typeof msg.method === 'string',
}))

import { CoreBridge } from './core-bridge.js'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { EventEmitter, Readable, Writable } from 'node:stream'

function createMockProcess() {
  const proc = new EventEmitter() as ReturnType<typeof spawn>
  const stdout = new EventEmitter()
  const stderr = new EventEmitter()
  const stdin = new Writable({
    write(_chunk, _enc, cb) {
      cb()
    },
  })

  Object.defineProperty(proc, 'stdout', { value: stdout, writable: true })
  Object.defineProperty(proc, 'stderr', { value: stderr, writable: true })
  Object.defineProperty(proc, 'stdin', { value: stdin, writable: true })
  Object.defineProperty(proc, 'killed', { value: false, writable: true })
  ;(proc as unknown as { kill: ReturnType<typeof vi.fn> }).kill = vi.fn()
  ;(stdout as unknown as { setEncoding: ReturnType<typeof vi.fn> }).setEncoding = vi.fn()
  ;(stderr as unknown as { setEncoding: ReturnType<typeof vi.fn> }).setEncoding = vi.fn()

  return proc
}

describe('CoreBridge', () => {
  let bridge: CoreBridge
  let mockProc: ReturnType<typeof createMockProcess>

  beforeEach(() => {
    vi.useFakeTimers()
    mockProc = createMockProcess()
    vi.mocked(spawn).mockReturnValue(mockProc)
    bridge = new CoreBridge({ bunPath: 'bun' })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('inicializa com ready = false', () => {
      expect(bridge.ready).toBe(false)
    })
  })

  describe('event emitter', () => {
    it('registra e emite eventos via on/off', () => {
      const handler = vi.fn()
      bridge.on('test', handler)
      // Emitting is private, so we test via start lifecycle events
      expect(handler).not.toHaveBeenCalled()

      bridge.off('test', handler)
    })

    it('remove handler com off', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      bridge.on('myEvent', handler1)
      bridge.on('myEvent', handler2)
      bridge.off('myEvent', handler1)
      // handler1 should be removed, handler2 remains
    })
  })

  describe('start', () => {
    it('spawna processo com cliPath', async () => {
      const b = new CoreBridge({ bunPath: 'bun', cliPath: '/path/to/cli/index.ts' })
      vi.mocked(existsSync).mockReturnValue(false)

      const startPromise = b.start()

      // Simulate ping response
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')

      await startPromise

      expect(spawn).toHaveBeenCalled()
      expect(b.ready).toBe(true)
    })

    it('spawna processo com athion global quando cliPath nao fornecido', async () => {
      const b = new CoreBridge({})

      const startPromise = b.start()
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')

      await startPromise

      expect(spawn).toHaveBeenCalledWith('athion', ['serve', '--mode=stdio'], expect.any(Object))
    })

    it('nao spawna se ja iniciado', async () => {
      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')
      await startPromise

      // Second call should be a no-op
      await bridge.start()
      expect(spawn).toHaveBeenCalledTimes(1)
    })

    it('emite ready quando ping responde', async () => {
      const readyHandler = vi.fn()
      bridge.on('ready', readyHandler)

      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')

      await startPromise

      expect(readyHandler).toHaveBeenCalled()
      expect(bridge.ready).toBe(true)
    })

    it('lanca erro se ping falhar (timeout)', async () => {
      const startPromise = bridge.start().catch((err: Error) => err)

      // Advance past the 10s timeout
      await vi.advanceTimersByTimeAsync(11000)

      const error = await startPromise
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain('Core process failed to start')
    })

    it('emite log quando stderr recebe dados', async () => {
      const logHandler = vi.fn()
      bridge.on('log', logHandler)

      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)

      mockProc.stderr!.emit('data', 'some log message')

      expect(logHandler).toHaveBeenCalledWith('some log message')

      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')
      await startPromise
    })

    it('emite exit quando processo termina', async () => {
      const exitHandler = vi.fn()
      bridge.on('exit', exitHandler)

      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')
      await startPromise

      mockProc.emit('exit', 0)

      expect(exitHandler).toHaveBeenCalledWith(0)
      expect(bridge.ready).toBe(false)
    })

    it('emite error quando processo falha', async () => {
      const errorHandler = vi.fn()
      bridge.on('error', errorHandler)

      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)

      mockProc.emit('error', new Error('spawn failed'))

      // After error, ready is set to false
      expect(errorHandler).toHaveBeenCalled()
      expect(bridge.ready).toBe(false)

      // Still need to resolve start (ping response)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')
      await startPromise
    })
  })

  describe('stop', () => {
    it('nao faz nada se nao iniciado', () => {
      bridge.stop() // Should not throw
    })

    it('envia SIGTERM ao processo', async () => {
      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')
      await startPromise

      bridge.stop()

      expect(mockProc.kill).toHaveBeenCalledWith('SIGTERM')
      expect(bridge.ready).toBe(false)
    })

    it('rejeita todas as requisicoes pendentes', async () => {
      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')
      await startPromise

      const reqPromise = bridge.request('chat.send', {})
      bridge.stop()

      await expect(reqPromise).rejects.toThrow('CoreBridge stopped')
    })
  })

  describe('request', () => {
    it('lanca erro se nao conectado', async () => {
      await expect(bridge.request('ping')).rejects.toThrow('CoreBridge not connected')
    })

    it('resolve quando recebe resposta com resultado', async () => {
      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')
      await startPromise

      const reqPromise = bridge.request('chat.send', { content: 'hello' })
      await vi.advanceTimersByTimeAsync(10)

      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":2,"result":{"ok":true}}\n')

      const result = await reqPromise
      expect(result).toEqual({ ok: true })
    })

    it('rejeita quando recebe resposta com erro', async () => {
      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')
      await startPromise

      const reqPromise = bridge.request('chat.send', {})
      await vi.advanceTimersByTimeAsync(10)

      mockProc.stdout!.emit(
        'data',
        '{"jsonrpc":"2.0","id":2,"error":{"code":-1,"message":"fail"}}\n',
      )

      await expect(reqPromise).rejects.toThrow('fail')
    })

    it('rejeita no timeout', async () => {
      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')
      await startPromise

      const reqPromise = bridge.request('chat.send', {}, 1000)

      // Catch the rejection to prevent unhandled rejection
      const resultPromise = reqPromise.catch((err: Error) => err)
      await vi.advanceTimersByTimeAsync(1100)

      const error = await resultPromise
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain('RPC timeout')
    })
  })

  describe('notify', () => {
    it('envia notificacao sem esperar resposta', async () => {
      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')
      await startPromise

      const writeSpy = vi.spyOn(mockProc.stdin!, 'write')
      bridge.notify('test.method', { data: 'hello' })

      expect(writeSpy).toHaveBeenCalled()
      const written = writeSpy.mock.calls[0]?.[0] as string
      const parsed = JSON.parse(written.trim())
      expect(parsed.method).toBe('test.method')
      expect(parsed.id).toBeUndefined()
    })

    it('nao lanca se nao conectado', () => {
      expect(() => bridge.notify('test')).not.toThrow()
    })
  })

  describe('onNotification / offNotification', () => {
    it('registra e recebe notificacoes do core', async () => {
      const handler = vi.fn()
      bridge.onNotification('chat.event', handler)

      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')
      await startPromise

      mockProc.stdout!.emit(
        'data',
        '{"jsonrpc":"2.0","method":"chat.event","params":{"type":"content","content":"hi"}}\n',
      )

      expect(handler).toHaveBeenCalledWith({ type: 'content', content: 'hi' })
    })

    it('remove handler de notificacao com offNotification', async () => {
      const handler = vi.fn()
      bridge.onNotification('chat.event', handler)
      bridge.offNotification('chat.event', handler)

      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')
      await startPromise

      mockProc.stdout!.emit(
        'data',
        '{"jsonrpc":"2.0","method":"chat.event","params":{"type":"content"}}\n',
      )

      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('handleData (buffer)', () => {
    it('lida com dados parciais e acumula no buffer', async () => {
      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)

      // Send partial response
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,')
      mockProc.stdout!.emit('data', '"result":"pong"}\n')

      await startPromise
      expect(bridge.ready).toBe(true)
    })

    it('lida com multiplas mensagens em um unico chunk', async () => {
      const handler = vi.fn()
      bridge.onNotification('test', handler)

      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')
      await startPromise

      mockProc.stdout!.emit(
        'data',
        '{"jsonrpc":"2.0","method":"test","params":"a"}\n{"jsonrpc":"2.0","method":"test","params":"b"}\n',
      )

      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('emite log para linhas nao-JSON', async () => {
      const logHandler = vi.fn()
      bridge.on('log', logHandler)

      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')
      await startPromise

      mockProc.stdout!.emit('data', 'not valid json\n')

      expect(logHandler).toHaveBeenCalledWith('not valid json')
    })

    it('ignora linhas vazias', async () => {
      const logHandler = vi.fn()
      bridge.on('log', logHandler)

      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')
      await startPromise

      mockProc.stdout!.emit('data', '\n\n\n')

      expect(logHandler).not.toHaveBeenCalled()
    })
  })

  describe('handleMessage', () => {
    it('ignora respostas sem requisicao pendente', async () => {
      const startPromise = bridge.start()
      await vi.advanceTimersByTimeAsync(10)
      mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":1,"result":"pong"}\n')
      await startPromise

      // Send response for non-existent request id 999
      expect(() => {
        mockProc.stdout!.emit('data', '{"jsonrpc":"2.0","id":999,"result":"ok"}\n')
      }).not.toThrow()
    })
  })
})
