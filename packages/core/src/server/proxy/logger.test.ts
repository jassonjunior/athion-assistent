/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createProxyLogger } from './logger'
import type { RequestLogData, ResponseLogData, StreamLogData } from './logger'

// Mock fs/promises para evitar escrita em disco
vi.mock('node:fs/promises', () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

describe('createProxyLogger', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('cria logger com metodos basicos', () => {
    const logger = createProxyLogger('test', 'info')
    expect(logger.debug).toBeTypeOf('function')
    expect(logger.info).toBeTypeOf('function')
    expect(logger.warn).toBeTypeOf('function')
    expect(logger.error).toBeTypeOf('function')
    expect(logger.logRequest).toBeTypeOf('function')
    expect(logger.logResponse).toBeTypeOf('function')
    expect(logger.logStreamComplete).toBeTypeOf('function')
  })

  it('respeita nivel de log - debug nao loga em nivel info', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const logger = createProxyLogger('test', 'info')
    logger.debug('should not log')
    expect(stderrSpy).not.toHaveBeenCalled()
  })

  it('loga mensagens no nivel correto', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const logger = createProxyLogger('test', 'info')
    logger.info('test message')
    expect(stderrSpy).toHaveBeenCalledTimes(1)
    const output = stderrSpy.mock.calls[0]![0] as string
    expect(output).toContain('INFO')
    expect(output).toContain('test message')
    expect(output).toContain('[test]')
  })

  it('loga warn e error em nivel info', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const logger = createProxyLogger('test', 'info')
    logger.warn('warning')
    logger.error('error')
    expect(stderrSpy).toHaveBeenCalledTimes(2)
  })

  it('loga extras como key=value', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const logger = createProxyLogger('test', 'info')
    logger.info('msg', { key: 'value', num: 42 })
    const output = stderrSpy.mock.calls[0]![0] as string
    expect(output).toContain('key=value')
    expect(output).toContain('num=42')
  })

  it('nivel error filtra info e warn', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const logger = createProxyLogger('test', 'error')
    logger.info('should not log')
    logger.warn('should not log')
    logger.error('should log')
    expect(stderrSpy).toHaveBeenCalledTimes(1)
  })

  it('nivel debug loga tudo', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const logger = createProxyLogger('test', 'debug')
    logger.debug('d')
    logger.info('i')
    logger.warn('w')
    logger.error('e')
    expect(stderrSpy).toHaveBeenCalledTimes(4)
  })
})

describe('logRequest', () => {
  it('loga dados do request', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const logger = createProxyLogger('test', 'info')

    const data: RequestLogData = {
      requestNumber: 1,
      model: 'test-model',
      messageCount: 3,
      hasTools: true,
      toolCount: 2,
      toolSummaries: [],
      promptTokens: 100,
      contextWindow: 8000,
      compressionApplied: false,
      stream: true,
      maxTokens: 1024,
      messages: [],
    }
    logger.logRequest(data)
    expect(stderrSpy).toHaveBeenCalled()
    const output = stderrSpy.mock.calls[0]![0] as string
    expect(output).toContain('#1')
    expect(output).toContain('test-model')
    expect(output).toContain('msgs=3')
  })
})

describe('logResponse', () => {
  it('loga dados da response', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const logger = createProxyLogger('test', 'info')

    const data: ResponseLogData = {
      requestNumber: 1,
      latencyMs: 250,
      promptTokens: 100,
      completionTokens: 50,
      finishReason: 'stop',
      middlewaresApplied: ['think-stripper'],
      contextWindow: 8000,
      messageCount: 3,
      content: 'Hello',
      toolCalls: [],
    }
    logger.logResponse(data)
    expect(stderrSpy).toHaveBeenCalled()
    const output = stderrSpy.mock.calls[0]![0] as string
    expect(output).toContain('#1')
    expect(output).toContain('250ms')
  })
})

describe('logStreamComplete', () => {
  it('loga dados do streaming completo', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    const logger = createProxyLogger('test', 'info')

    const data: StreamLogData = {
      requestNumber: 2,
      latencyMs: 500,
      chunkCount: 10,
      promptTokens: 200,
      completionTokens: 100,
      toolCallsExtracted: 0,
      thinkTagsStripped: false,
      contextWindow: 8000,
      content: 'Streamed content',
      messageCount: 5,
      finishReason: 'stop',
      streamToolCalls: [],
    }
    logger.logStreamComplete(data)
    expect(stderrSpy).toHaveBeenCalled()
    const output = stderrSpy.mock.calls[0]![0] as string
    expect(output).toContain('#2')
    expect(output).toContain('STREAM')
    expect(output).toContain('10 chunks')
  })
})
