import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createConfigManager } from './config'
import { DEFAULT_CONFIG } from './schema'

// Mock loaders para isolar dos arquivos do filesystem
vi.mock('./loader', () => ({
  loadGlobalConfig: vi.fn(() => ({})),
  loadProjectConfig: vi.fn(() => ({})),
  loadEnvConfig: vi.fn(() => ({})),
}))

import { loadEnvConfig, loadGlobalConfig, loadProjectConfig } from './loader'

beforeEach(() => {
  vi.mocked(loadGlobalConfig).mockReturnValue({})
  vi.mocked(loadProjectConfig).mockReturnValue({})
  vi.mocked(loadEnvConfig).mockReturnValue({})
})

describe('createConfigManager', () => {
  describe('get / getAll', () => {
    it('retorna defaults quando não há overrides', () => {
      const config = createConfigManager()
      expect(config.get('provider')).toBe(DEFAULT_CONFIG.provider)
      expect(config.get('temperature')).toBe(DEFAULT_CONFIG.temperature)
      expect(config.get('telemetry')).toBe(false)
    })

    it('CLI args sobrescrevem defaults', () => {
      const config = createConfigManager({ provider: 'openai', model: 'gpt-4o' })
      expect(config.get('provider')).toBe('openai')
      expect(config.get('model')).toBe('gpt-4o')
    })

    it('getAll retorna objeto congelado', () => {
      const config = createConfigManager()
      const all = config.getAll()
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(all as any).provider = 'changed'
      }).toThrow()
    })

    it('getAll inclui todas as chaves do schema', () => {
      const config = createConfigManager()
      const all = config.getAll()
      expect(all).toHaveProperty('provider')
      expect(all).toHaveProperty('model')
      expect(all).toHaveProperty('temperature')
      expect(all).toHaveProperty('telemetry')
      expect(all).toHaveProperty('logLevel')
    })
  })

  describe('set', () => {
    it('altera valor em runtime', () => {
      const config = createConfigManager()
      config.set('temperature', 1.5)
      expect(config.get('temperature')).toBe(1.5)
    })

    it('não dispara listener se valor não mudou', () => {
      const config = createConfigManager({ temperature: 0.7 })
      const listener = vi.fn()
      config.onChanged(listener)
      config.set('temperature', 0.7)
      expect(listener).not.toHaveBeenCalled()
    })

    it('notifica listeners ao mudar valor', () => {
      const config = createConfigManager()
      const listener = vi.fn()
      config.onChanged(listener)
      config.set('model', 'gpt-4o-mini')
      expect(listener).toHaveBeenCalledWith('model', 'gpt-4o-mini')
    })

    it('notifica múltiplos listeners', () => {
      const config = createConfigManager()
      const l1 = vi.fn()
      const l2 = vi.fn()
      config.onChanged(l1)
      config.onChanged(l2)
      config.set('logLevel', 'debug')
      expect(l1).toHaveBeenCalledOnce()
      expect(l2).toHaveBeenCalledOnce()
    })
  })

  describe('onChanged unsubscribe', () => {
    it('para de notificar após unsubscribe', () => {
      const config = createConfigManager()
      const listener = vi.fn()
      const unsub = config.onChanged(listener)
      unsub()
      config.set('temperature', 0.1)
      expect(listener).not.toHaveBeenCalled()
    })
  })

  describe('reload', () => {
    it('reload mantém CLI args', () => {
      const config = createConfigManager({ provider: 'anthropic' })
      config.reload()
      expect(config.get('provider')).toBe('anthropic')
    })

    it('reload perde valores set em runtime', () => {
      const config = createConfigManager()
      config.set('temperature', 1.9)
      config.reload()
      expect(config.get('temperature')).toBe(DEFAULT_CONFIG.temperature)
    })

    it('reload combina globals do loader', () => {
      vi.mocked(loadGlobalConfig).mockReturnValue({ temperature: 0.3 })
      const config = createConfigManager()
      expect(config.get('temperature')).toBe(0.3)
    })

    it('CLI args têm maior prioridade que global config', () => {
      vi.mocked(loadGlobalConfig).mockReturnValue({ temperature: 0.3 })
      const config = createConfigManager({ temperature: 0.9 })
      expect(config.get('temperature')).toBe(0.9)
    })
  })
})

describe('DEFAULT_CONFIG', () => {
  it('tem telemetry=false por padrão', () => {
    expect(DEFAULT_CONFIG.telemetry).toBe(false)
  })

  it('tem defaultPermission=ask por padrão', () => {
    expect(DEFAULT_CONFIG.defaultPermission).toBe('ask')
  })

  it('tem logLevel=info por padrão', () => {
    expect(DEFAULT_CONFIG.logLevel).toBe('info')
  })
})
