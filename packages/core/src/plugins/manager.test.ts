/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createPluginManager } from './manager'
import type { PluginManagerDeps } from './manager'
import type { PluginDefinition } from './types'

// ── helpers ─────────────────────────────────────────────────────────────────

function makeDeps(): PluginManagerDeps {
  return {
    bus: {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
      once: vi.fn(() => vi.fn()),
    } as unknown as PluginManagerDeps['bus'],
    config: {
      get: vi.fn(),
      set: vi.fn(),
    } as unknown as PluginManagerDeps['config'],
    tools: {
      register: vi.fn(),
      unregister: vi.fn(),
      get: vi.fn(),
      list: vi.fn(() => []),
      has: vi.fn(() => false),
      execute: vi.fn(),
    } as unknown as PluginManagerDeps['tools'],
    provider: {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(() => []),
    } as unknown as PluginManagerDeps['provider'],
  }
}

function makePlugin(overrides: Partial<PluginDefinition> = {}): PluginDefinition {
  return {
    name: 'test-plugin',
    version: '1.0.0',
    description: 'A test plugin',
    onLoad: vi.fn(),
    onUnload: vi.fn(),
    ...overrides,
  }
}

// ── tests ───────────────────────────────────────────────────────────────────

describe('createPluginManager', () => {
  let deps: PluginManagerDeps

  beforeEach(() => {
    deps = makeDeps()
  })

  describe('load', () => {
    it('carrega plugin e o adiciona na lista', async () => {
      const manager = createPluginManager(deps)
      const plugin = makePlugin()

      await manager.load(plugin)

      expect(manager.has('test-plugin')).toBe(true)
      expect(manager.get('test-plugin')).toBeDefined()
      expect(manager.get('test-plugin')!.definition).toBe(plugin)
    })

    it('chama onLoad com PluginContext', async () => {
      const manager = createPluginManager(deps)
      const onLoad = vi.fn()
      const plugin = makePlugin({ onLoad })

      await manager.load(plugin)

      expect(onLoad).toHaveBeenCalledTimes(1)
      const ctx = onLoad.mock.calls[0][0]
      expect(ctx).toHaveProperty('bus')
      expect(ctx).toHaveProperty('config')
      expect(ctx).toHaveProperty('tools')
      expect(ctx).toHaveProperty('provider')
      expect(ctx).toHaveProperty('log')
    })

    it('emite PluginLoaded no bus após carregar', async () => {
      const manager = createPluginManager(deps)
      await manager.load(makePlugin())

      expect(deps.bus.publish).toHaveBeenCalled()
    })

    it('lança erro ao carregar plugin duplicado', async () => {
      const manager = createPluginManager(deps)
      await manager.load(makePlugin())

      await expect(manager.load(makePlugin())).rejects.toThrow('já está carregado')
    })

    it('faz cleanup e emite PluginError quando onLoad falha', async () => {
      const manager = createPluginManager(deps)
      const plugin = makePlugin({
        onLoad: vi.fn().mockRejectedValue(new Error('onLoad explodiu')),
      })

      await expect(manager.load(plugin)).rejects.toThrow('Falha ao carregar')
      expect(manager.has('test-plugin')).toBe(false)
    })

    it('rastreia tools registradas pelo plugin', async () => {
      const manager = createPluginManager(deps)
      const plugin = makePlugin({
        onLoad: (ctx) => {
          ctx.tools.register({ name: 'my-tool' } as never)
        },
      })

      await manager.load(plugin)

      const loaded = manager.get('test-plugin')!
      expect(loaded.registeredTools).toContain('my-tool')
      expect(deps.tools.register).toHaveBeenCalledWith({ name: 'my-tool' })
    })

    it('rastreia bus subscriptions do plugin', async () => {
      const unsub = vi.fn()
      ;(deps.bus.subscribe as ReturnType<typeof vi.fn>).mockReturnValue(unsub)

      const manager = createPluginManager(deps)
      const plugin = makePlugin({
        onLoad: (ctx) => {
          ctx.bus.subscribe({} as never, vi.fn())
        },
      })

      await manager.load(plugin)

      const loaded = manager.get('test-plugin')!
      expect(loaded.busUnsubscribes).toHaveLength(1)
    })

    it('preserva sourcePath quando fornecido', async () => {
      const manager = createPluginManager(deps)
      await manager.load(makePlugin(), '/path/to/plugin')

      expect(manager.get('test-plugin')!.path).toBe('/path/to/plugin')
    })
  })

  describe('unload', () => {
    it('remove plugin da lista', async () => {
      const manager = createPluginManager(deps)
      await manager.load(makePlugin())

      await manager.unload('test-plugin')

      expect(manager.has('test-plugin')).toBe(false)
      expect(manager.get('test-plugin')).toBeUndefined()
    })

    it('chama onUnload do plugin', async () => {
      const onUnload = vi.fn()
      const manager = createPluginManager(deps)
      await manager.load(makePlugin({ onUnload }))

      await manager.unload('test-plugin')

      expect(onUnload).toHaveBeenCalledTimes(1)
    })

    it('faz cleanup de tools registradas', async () => {
      const manager = createPluginManager(deps)
      await manager.load(
        makePlugin({
          onLoad: (ctx) => {
            ctx.tools.register({ name: 'tracked-tool' } as never)
          },
        }),
      )

      await manager.unload('test-plugin')

      expect(deps.tools.unregister).toHaveBeenCalledWith('tracked-tool')
    })

    it('faz cleanup de bus subscriptions', async () => {
      const unsub = vi.fn()
      ;(deps.bus.subscribe as ReturnType<typeof vi.fn>).mockReturnValue(unsub)

      const manager = createPluginManager(deps)
      await manager.load(
        makePlugin({
          onLoad: (ctx) => {
            ctx.bus.subscribe({} as never, vi.fn())
          },
        }),
      )

      await manager.unload('test-plugin')

      expect(unsub).toHaveBeenCalled()
    })

    it('emite PluginUnloaded no bus', async () => {
      const manager = createPluginManager(deps)
      await manager.load(makePlugin())

      await manager.unload('test-plugin')

      // publish chamado no load e no unload
      expect(deps.bus.publish).toHaveBeenCalledTimes(2)
    })

    it('lança erro ao descarregar plugin inexistente', async () => {
      const manager = createPluginManager(deps)
      await expect(manager.unload('nope')).rejects.toThrow('não está carregado')
    })

    it('não lança se onUnload do plugin falhar', async () => {
      const manager = createPluginManager(deps)
      await manager.load(
        makePlugin({
          onUnload: vi.fn().mockRejectedValue(new Error('cleanup fail')),
        }),
      )

      await expect(manager.unload('test-plugin')).resolves.not.toThrow()
    })
  })

  describe('reload', () => {
    it('descarrega e recarrega com nova definição', async () => {
      const manager = createPluginManager(deps)
      const original = makePlugin()
      await manager.load(original)

      const updated = makePlugin({ version: '2.0.0' })
      await manager.reload('test-plugin', updated)

      expect(manager.get('test-plugin')!.definition.version).toBe('2.0.0')
    })

    it('lança erro se plugin não está carregado', async () => {
      const manager = createPluginManager(deps)
      await expect(manager.reload('nope')).rejects.toThrow('não está carregado')
    })
  })

  describe('list / get / has', () => {
    it('list retorna todos os plugins carregados', async () => {
      const manager = createPluginManager(deps)
      await manager.load(makePlugin({ name: 'plugin-a' }))
      await manager.load(makePlugin({ name: 'plugin-b' }))

      expect(manager.list()).toHaveLength(2)
    })

    it('list retorna array vazio quando nenhum plugin carregado', () => {
      const manager = createPluginManager(deps)
      expect(manager.list()).toEqual([])
    })

    it('get retorna undefined para plugin inexistente', () => {
      const manager = createPluginManager(deps)
      expect(manager.get('nope')).toBeUndefined()
    })

    it('has retorna false para plugin inexistente', () => {
      const manager = createPluginManager(deps)
      expect(manager.has('nope')).toBe(false)
    })
  })
})
