/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createLogger } from './logger'
import type { Logger } from './logger'

describe('createLogger', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>
  let stdoutSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    stderrSpy.mockRestore()
    stdoutSpy.mockRestore()
  })

  it('cria logger com todos os métodos de nível', () => {
    const log = createLogger('test')
    expect(typeof log.trace).toBe('function')
    expect(typeof log.debug).toBe('function')
    expect(typeof log.info).toBe('function')
    expect(typeof log.warn).toBe('function')
    expect(typeof log.error).toBe('function')
    expect(typeof log.fatal).toBe('function')
    expect(typeof log.child).toBe('function')
    expect(typeof log.setLevel).toBe('function')
  })

  it('respeita nível mínimo de log', () => {
    const log = createLogger('test')
    log.setLevel('error')

    log.info('should not appear')
    log.warn('should not appear')
    log.error('should appear')

    // info e warn não devem ter sido escritos (apenas error)
    const calls = stderrSpy.mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('should appear'))).toBe(true)
    expect(calls.filter((c) => c.includes('should not appear')).length).toBe(0)
  })

  it('setLevel altera nível em runtime', () => {
    const log = createLogger('test')
    log.setLevel('silent')

    log.fatal('nothing')

    // silent não deve produzir saída
    const calls = stderrSpy.mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('nothing'))).toBe(false)
  })

  it('aceita objeto como primeiro argumento', () => {
    const log = createLogger('test')
    log.setLevel('info')

    log.info({ userId: '123' }, 'User logged in')

    const calls = stderrSpy.mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('User logged in'))).toBe(true)
    expect(calls.some((c) => c.includes('userId'))).toBe(true)
  })

  it('aceita string como primeiro argumento', () => {
    const log = createLogger('test')
    log.setLevel('info')

    log.info('Simple message')

    const calls = stderrSpy.mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('Simple message'))).toBe(true)
  })

  it('inclui nome do logger na saída', () => {
    const log = createLogger('my-module')
    log.setLevel('info')

    log.info('Test')

    const calls = stderrSpy.mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('[my-module]'))).toBe(true)
  })

  it('child cria logger com bindings extras', () => {
    const parent = createLogger('parent')
    const child = parent.child({ module: 'orchestrator' })
    child.setLevel('info')

    child.info('Child message')

    const calls = stderrSpy.mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('orchestrator'))).toBe(true)
  })

  it('logger sem nome não inclui prefixo', () => {
    const log = createLogger()
    log.setLevel('info')

    log.info('No name')

    const calls = stderrSpy.mock.calls.map((c) => String(c[0]))
    const noNameCall = calls.find((c) => c.includes('No name'))
    expect(noNameCall).toBeDefined()
    expect(noNameCall).not.toContain('[')
  })

  it('inclui timestamp ISO na saída', () => {
    const log = createLogger('test')
    log.setLevel('info')

    log.info('Timestamped')

    const calls = stderrSpy.mock.calls.map((c) => String(c[0]))
    // ISO format: YYYY-MM-DDTHH:mm:ss
    expect(calls.some((c) => /\d{4}-\d{2}-\d{2}T/.test(c))).toBe(true)
  })

  it('inclui label do nível na saída', () => {
    const log = createLogger('test')
    log.setLevel('warn')

    log.warn('Warning message')

    const calls = stderrSpy.mock.calls.map((c) => String(c[0]))
    expect(calls.some((c) => c.includes('WARN'))).toBe(true)
  })
})
