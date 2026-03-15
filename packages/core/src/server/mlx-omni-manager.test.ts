/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createMlxOmniManager } from './mlx-omni-manager'

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
}))

describe('createMlxOmniManager', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('cria manager com configuracao padrao', () => {
    const manager = createMlxOmniManager()
    expect(manager.baseUrl).toBe('http://localhost:10240/v1')
    expect(manager.currentModel).toBe('')
  })

  it('aceita overrides de configuracao', () => {
    const manager = createMlxOmniManager({ port: 9999, host: '0.0.0.0' })
    expect(manager.baseUrl).toBe('http://0.0.0.0:9999/v1')
  })

  describe('isRunning', () => {
    it('retorna true quando servidor responde ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
      const manager = createMlxOmniManager()
      expect(await manager.isRunning()).toBe(true)
    })

    it('retorna false quando servidor nao responde', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))
      const manager = createMlxOmniManager()
      expect(await manager.isRunning()).toBe(false)
    })

    it('retorna false quando servidor responde com erro', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })
      const manager = createMlxOmniManager()
      expect(await manager.isRunning()).toBe(false)
    })
  })

  describe('ensureRunning', () => {
    it('nao faz nada se servidor ja esta rodando', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
      const manager = createMlxOmniManager()
      await manager.ensureRunning()
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    })

    it('nao inicia se autoStart esta desabilitado', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })
      const manager = createMlxOmniManager({ autoStart: false })
      await manager.ensureRunning()
      // Apenas 1 chamada (isRunning), sem spawn
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('stop', () => {
    it('nao lanca erro quando nao ha processo', () => {
      const manager = createMlxOmniManager()
      expect(() => manager.stop()).not.toThrow()
    })
  })

  describe('swapModel', () => {
    it('atualiza currentModel na primeira chamada (sem previous model)', async () => {
      // First call, no previous model - goes to ensureRunning + pre-warm
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      })
      const manager = createMlxOmniManager()
      await manager.swapModel('test-model')
      expect(manager.currentModel).toBe('test-model')
    })

    it('faz pre-warm do novo modelo', async () => {
      const fetchCalls: Array<{ url: string; body?: string }> = []
      globalThis.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
        fetchCalls.push({ url, body: opts?.body as string })
        return Promise.resolve({ ok: true, text: () => Promise.resolve('ok') })
      })

      const manager = createMlxOmniManager()
      await manager.swapModel('test-model')

      const preWarmCall = fetchCalls.find(
        (c) => c.url.includes('/chat/completions') && c.body?.includes('test-model'),
      )
      expect(preWarmCall).toBeTruthy()
    })

    it('lida com falha no pre-warm graciosamente', async () => {
      let callCount = 0
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++
        if (url.includes('/models')) return Promise.resolve({ ok: true })
        // pre-warm fails
        return Promise.reject(new Error('pre-warm failed'))
      })

      const manager = createMlxOmniManager()
      await manager.swapModel('test-model')
      expect(manager.currentModel).toBe('test-model')
    })
  })

  describe('touch', () => {
    it('e um no-op (nao lanca erro)', () => {
      const manager = createMlxOmniManager()
      expect(() => manager.touch()).not.toThrow()
    })
  })
})
