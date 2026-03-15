import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createLlamaCppManager } from './llama-cpp-manager'

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
}))

describe('createLlamaCppManager', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('cria manager com configuracao padrao', () => {
    const manager = createLlamaCppManager()
    expect(manager.baseUrl).toBe('http://127.0.0.1:8080/v1')
    expect(manager.currentModel).toBe('')
  })

  it('aceita overrides de configuracao', () => {
    const manager = createLlamaCppManager({ port: 9090, host: '0.0.0.0' })
    expect(manager.baseUrl).toBe('http://0.0.0.0:9090/v1')
  })

  describe('isRunning', () => {
    it('retorna true quando servidor responde ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
      const manager = createLlamaCppManager()
      expect(await manager.isRunning()).toBe(true)
    })

    it('retorna false quando servidor nao responde', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))
      const manager = createLlamaCppManager()
      expect(await manager.isRunning()).toBe(false)
    })

    it('retorna false quando servidor responde com erro', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })
      const manager = createLlamaCppManager()
      expect(await manager.isRunning()).toBe(false)
    })
  })

  describe('ensureRunning', () => {
    it('nao faz nada se servidor ja esta rodando', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
      const manager = createLlamaCppManager()
      await manager.ensureRunning()
      // fetch chamado apenas 1 vez (isRunning check)
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    })

    it('nao inicia se autoStart esta desabilitado', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false })
      const manager = createLlamaCppManager({ autoStart: false })
      await manager.ensureRunning()
      // Nao deve tentar spawnar processo
    })
  })

  describe('stop', () => {
    it('nao lanca erro quando nao ha processo', () => {
      const manager = createLlamaCppManager()
      expect(() => manager.stop()).not.toThrow()
    })
  })

  describe('swapModel', () => {
    it('atualiza currentModel', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('ok'),
      })
      const manager = createLlamaCppManager()
      await manager.swapModel('new-model')
      expect(manager.currentModel).toBe('new-model')
    })

    it('faz pre-warm do novo modelo', async () => {
      const fetchCalls: string[] = []
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        fetchCalls.push(url)
        return Promise.resolve({ ok: true, text: () => Promise.resolve('ok') })
      })
      const manager = createLlamaCppManager()
      await manager.swapModel('test-model')
      // Deve ter feito pre-warm call
      expect(fetchCalls.some((url) => url.includes('/chat/completions'))).toBe(true)
    })

    it('lida com falha no pre-warm graciosamente', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'))
      const manager = createLlamaCppManager()
      // Nao deve lancar erro
      await manager.swapModel('test-model')
      expect(manager.currentModel).toBe('test-model')
    })
  })

  describe('touch', () => {
    it('e um no-op (nao lanca erro)', () => {
      const manager = createLlamaCppManager()
      expect(() => manager.touch()).not.toThrow()
    })
  })
})
