/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createVllmManager } from './vllm-manager'
import type { VllmManager } from './vllm-manager'

describe('createVllmManager', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.useRealTimers()
  })

  it('cria manager com configuracao padrao', () => {
    const manager = createVllmManager()
    expect(manager.baseUrl).toBe('http://localhost:8000/v1')
    expect(manager.currentModel).toContain('Qwen3') // default model path
  })

  it('aceita overrides de configuracao', () => {
    const manager = createVllmManager({
      port: 7777,
      host: '0.0.0.0',
      model: '/path/to/custom-model',
    })
    expect(manager.baseUrl).toBe('http://0.0.0.0:7777/v1')
    expect(manager.currentModel).toBe('/path/to/custom-model')
  })

  describe('isRunning', () => {
    it('retorna true quando servidor responde ok', async () => {
      vi.useRealTimers()
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
      const manager = createVllmManager()
      expect(await manager.isRunning()).toBe(true)
    })

    it('retorna false quando servidor nao responde', async () => {
      vi.useRealTimers()
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))
      const manager = createVllmManager()
      expect(await manager.isRunning()).toBe(false)
    })
  })

  describe('ensureRunning', () => {
    it('nao faz nada se servidor ja esta rodando', async () => {
      vi.useRealTimers()
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
      const manager = createVllmManager()
      await manager.ensureRunning()
      // Apenas 1 chamada (isRunning check)
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('stop', () => {
    it('nao lanca erro quando nao ha processo', () => {
      const manager = createVllmManager()
      expect(() => manager.stop()).not.toThrow()
    })
  })

  describe('swapModel', () => {
    it('nao reinicia se mesmo modelo e servidor esta rodando', async () => {
      vi.useRealTimers()
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
      const manager = createVllmManager({ model: 'test-model' })
      await manager.swapModel('test-model')
      // Deve apenas chamar isRunning (1 call) sem reiniciar
      expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    })

    it('atualiza currentModel apos swap', async () => {
      vi.useRealTimers()
      // isRunning returns false initially, then Bun.spawn would be called
      // Since Bun.spawn isn't easily mockable, we test the model update
      const manager = createVllmManager({ model: 'old-model' })
      try {
        await manager.swapModel('new-model')
      } catch {
        // Expected: Bun.spawn may not work in test
      }
      expect(manager.currentModel).toBe('new-model')
    })
  })

  describe('touch', () => {
    it('nao lanca erro', () => {
      const manager = createVllmManager()
      expect(() => manager.touch()).not.toThrow()
    })

    it('nao faz nada quando ttl esta desabilitado', () => {
      const manager = createVllmManager({ ttlMinutes: 0 })
      expect(() => manager.touch()).not.toThrow()
    })
  })
})

describe('VllmManager interface', () => {
  it('expoe todos os metodos da interface', () => {
    const manager = createVllmManager()
    expect(manager.isRunning).toBeTypeOf('function')
    expect(manager.ensureRunning).toBeTypeOf('function')
    expect(manager.stop).toBeTypeOf('function')
    expect(manager.swapModel).toBeTypeOf('function')
    expect(manager.touch).toBeTypeOf('function')
    expect(typeof manager.baseUrl).toBe('string')
    expect(typeof manager.currentModel).toBe('string')
  })
})
