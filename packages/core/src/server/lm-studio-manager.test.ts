/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createLmStudioManager } from './lm-studio-manager'

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
}))

describe('createLmStudioManager', () => {
  let originalFetch: typeof globalThis.fetch

  beforeEach(() => {
    originalFetch = globalThis.fetch
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('cria manager com configuracao padrao', () => {
    const manager = createLmStudioManager()
    expect(manager.baseUrl).toBe('http://127.0.0.1:1234/v1')
    expect(manager.currentModel).toBe('')
  })

  it('aceita overrides de configuracao', () => {
    const manager = createLmStudioManager({ port: 5555, host: '0.0.0.0' })
    expect(manager.baseUrl).toBe('http://0.0.0.0:5555/v1')
  })

  it('suporta apiKey', () => {
    const manager = createLmStudioManager({ apiKey: 'test-key' })
    expect(manager.baseUrl).toBe('http://127.0.0.1:1234/v1')
  })

  describe('isRunning', () => {
    it('retorna true quando servidor responde ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
      const manager = createLmStudioManager()
      expect(await manager.isRunning()).toBe(true)
    })

    it('retorna false quando servidor nao responde', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))
      const manager = createLmStudioManager()
      expect(await manager.isRunning()).toBe(false)
    })

    it('envia header Authorization quando apiKey configurada', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
      const manager = createLmStudioManager({ apiKey: 'my-key' })
      await manager.isRunning()
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer my-key' }),
        }),
      )
    })

    it('nao envia Authorization quando apiKey nao configurada', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
      const manager = createLmStudioManager()
      await manager.isRunning()
      const callArgs = (globalThis.fetch as any).mock.calls[0]
      expect(callArgs[1].headers).toEqual({})
    })
  })

  describe('ensureRunning', () => {
    it('detecta modelo carregado na primeira chamada', async () => {
      let callCount = 0
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        callCount++
        if (url.includes('/v1/models')) {
          return Promise.resolve({ ok: true })
        }
        if (url.includes('/api/v0/models')) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                data: [{ id: 'detected-model', state: 'loaded' }],
              }),
          })
        }
        return Promise.resolve({ ok: false })
      })

      const manager = createLmStudioManager()
      await manager.ensureRunning()
      expect(manager.currentModel).toBe('detected-model')
    })

    it('nao lanca erro quando servidor nao esta acessivel', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('timeout'))
      const manager = createLmStudioManager()
      await expect(manager.ensureRunning()).resolves.not.toThrow()
    })
  })

  describe('stop', () => {
    it('e um no-op (nao lanca erro)', () => {
      const manager = createLmStudioManager()
      expect(() => manager.stop()).not.toThrow()
    })
  })

  describe('touch', () => {
    it('e um no-op (nao lanca erro)', () => {
      const manager = createLmStudioManager()
      expect(() => manager.touch()).not.toThrow()
    })
  })

  describe('swapModel', () => {
    it('atualiza currentModel', async () => {
      // Mock: ensureRunning detects running but no model
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: true })
      const manager = createLmStudioManager()

      // swapModel uses Bun.spawn for `lms` CLI, which we can't easily mock
      // So we just test the state update when there's no previous model
      // (skips unload, just does load which would use Bun.spawn)
      // Since Bun.spawn isn't available in test env, it will throw
      // We wrap to catch the expected error
      try {
        await manager.swapModel('new-model')
      } catch {
        // Expected: Bun.spawn not available in test
      }
      expect(manager.currentModel).toBe('new-model')
    })
  })
})
