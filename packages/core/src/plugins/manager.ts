import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Bus } from '../bus/bus'
import { PluginError, PluginLoaded, PluginUnloaded } from '../bus/events'
import type { ConfigManager } from '../config'
import type { ProviderLayer } from '../provider'
import type { ToolRegistry } from '../tools/types'
import type {
  LoadedPlugin,
  PluginContext,
  PluginDefinition,
  PluginLogger,
  PluginManager,
} from './types'

/**
 * Dependências que o PluginManager precisa do core.
 * Injetadas via factory — o manager não importa nada diretamente.
 */
export interface PluginManagerDeps {
  bus: Bus
  config: ConfigManager
  tools: ToolRegistry
  provider: ProviderLayer
}

/**
 * Cria uma instância do PluginManager.
 *
 * O manager controla o ciclo de vida dos plugins:
 * 1. Load → importa o módulo, chama onLoad(), rastreia registros
 * 2. Unload → chama onUnload(), remove tools e listeners automaticamente
 * 3. Reload → unload + load (hot-reload sem restart)
 *
 * Tracking automático:
 * - Wrapa o ToolRegistry para interceptar register/unregister do plugin
 * - Wrapa o Bus para interceptar subscribe do plugin
 * - No unload, tudo que o plugin registrou é removido automaticamente
 *
 * @param deps - Dependências do core (bus, config, tools, provider)
 * @returns Instância do PluginManager
 */
export function createPluginManager(deps: PluginManagerDeps): PluginManager {
  const plugins = new Map<string, LoadedPlugin>()

  // ── Load ──────────────────────────────────────────────────

  async function load(definition: PluginDefinition, sourcePath?: string): Promise<void> {
    if (plugins.has(definition.name)) {
      throw new Error(`Plugin '${definition.name}' já está carregado. Use reload() para atualizar.`)
    }

    const loaded: LoadedPlugin = {
      definition,
      path: sourcePath,
      loadedAt: Date.now(),
      registeredTools: [],
      busUnsubscribes: [],
    }

    // Cria contexto com tracking — intercepta o que o plugin registra
    const ctx = createTrackedContext(deps, definition.name, loaded)

    try {
      await definition.onLoad(ctx)
      plugins.set(definition.name, loaded)
      ctx.log.info(`Carregado (v${definition.version}) — ${loaded.registeredTools.length} tools`)

      // Emite evento no bus para que outros módulos saibam
      deps.bus.publish(PluginLoaded, {
        name: definition.name,
        version: definition.version,
        toolsRegistered: [...loaded.registeredTools],
      })
    } catch (err) {
      // Se onLoad falhou, faz cleanup do que já foi registrado
      cleanupPlugin(loaded, deps)
      const msg = err instanceof Error ? err.message : String(err)

      deps.bus.publish(PluginError, { name: definition.name, error: msg })
      throw new Error(`Falha ao carregar plugin '${definition.name}': ${msg}`, { cause: err })
    }
  }

  // ── Unload ────────────────────────────────────────────────

  async function unload(name: string): Promise<void> {
    const loaded = plugins.get(name)
    if (!loaded) {
      throw new Error(`Plugin '${name}' não está carregado.`)
    }

    // Chama onUnload do plugin (se existir) — chance de fazer cleanup próprio
    if (loaded.definition.onUnload) {
      const ctx = createSimpleContext(deps, name)
      try {
        await loaded.definition.onUnload(ctx)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        ctx.log.warn(`Erro no onUnload: ${msg}`)
      }
    }

    // Cleanup automático — remove tudo que o plugin registrou
    cleanupPlugin(loaded, deps)
    plugins.delete(name)

    deps.bus.publish(PluginUnloaded, { name })
    createLogger(name).info('Descarregado')
  }

  // ── Reload ────────────────────────────────────────────────

  async function reload(name: string, newDefinition?: PluginDefinition): Promise<void> {
    const loaded = plugins.get(name)
    if (!loaded) {
      throw new Error(`Plugin '${name}' não está carregado. Use load() primeiro.`)
    }

    // Se não recebeu nova definição, reimporta do path original
    const definition = newDefinition ?? (await reimportPlugin(loaded))

    await unload(name)
    await load(definition, loaded.path)
  }

  // ── Load from Directory ───────────────────────────────────

  async function loadFromDirectory(dir: string): Promise<void> {
    const resolvedDir = resolve(dir.replace('~', process.env.HOME ?? '.'))

    if (!existsSync(resolvedDir)) {
      return // Diretório não existe — silencioso, não é erro
    }

    const entries = readdirSync(resolvedDir)
    for (const entry of entries) {
      const pluginDir = join(resolvedDir, entry)
      if (!statSync(pluginDir).isDirectory()) continue

      try {
        const definition = await importPlugin(pluginDir)
        await load(definition, pluginDir)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        createLogger(entry).error(`Falha ao carregar de ${pluginDir}: ${msg}`)
      }
    }
  }

  // ── Consultas ─────────────────────────────────────────────

  function list(): LoadedPlugin[] {
    return [...plugins.values()]
  }

  function get(name: string): LoadedPlugin | undefined {
    return plugins.get(name)
  }

  function has(name: string): boolean {
    return plugins.has(name)
  }

  return { load, unload, reload, loadFromDirectory, list, get, has }
}

// ── Helpers internos ──────────────────────────────────────────

/**
 * Cria um PluginContext com tracking automático.
 * Wrapa tools.register e bus.subscribe para rastrear o que o plugin faz.
 * Isso permite cleanup automático no unload, mesmo se o plugin não fizer.
 */
function createTrackedContext(
  deps: PluginManagerDeps,
  pluginName: string,
  loaded: LoadedPlugin,
): PluginContext {
  const log = createLogger(pluginName)

  // Wrapa o ToolRegistry — intercepta register para rastrear
  const trackedTools: PluginContext['tools'] = {
    ...deps.tools,
    register(tool) {
      deps.tools.register(tool)
      loaded.registeredTools.push(tool.name)
    },
    unregister(name) {
      deps.tools.unregister(name)
      loaded.registeredTools = loaded.registeredTools.filter((t) => t !== name)
    },
  }

  // Wrapa o Bus — intercepta subscribe para rastrear unsubscribes
  const trackedBus: PluginContext['bus'] = {
    ...deps.bus,
    subscribe(event, handler) {
      const unsub = deps.bus.subscribe(event, handler)
      loaded.busUnsubscribes.push(unsub)
      return unsub
    },
    once(event, handler) {
      const unsub = deps.bus.once(event, handler)
      loaded.busUnsubscribes.push(unsub)
      return unsub
    },
  }

  return {
    bus: trackedBus,
    config: deps.config,
    tools: trackedTools,
    provider: deps.provider,
    log,
  }
}

/**
 * Cria um PluginContext simples (sem tracking).
 * Usado no onUnload — nesse ponto o plugin já está saindo.
 */
function createSimpleContext(deps: PluginManagerDeps, pluginName: string): PluginContext {
  return {
    bus: deps.bus,
    config: deps.config,
    tools: deps.tools,
    provider: deps.provider,
    log: createLogger(pluginName),
  }
}

/**
 * Remove tudo que o plugin registrou — tools e bus listeners.
 * Chamado no unload e também se onLoad falhar (rollback).
 */
function cleanupPlugin(loaded: LoadedPlugin, deps: PluginManagerDeps): void {
  // Remove tools registradas pelo plugin
  for (const toolName of loaded.registeredTools) {
    try {
      deps.tools.unregister(toolName)
    } catch {
      // Tool pode já ter sido removida pelo onUnload do plugin — ok
    }
  }

  // Remove listeners do bus
  for (const unsub of loaded.busUnsubscribes) {
    try {
      unsub()
    } catch {
      // Listener pode já ter sido removido — ok
    }
  }
}

/**
 * Importa um plugin de um diretório.
 * Busca index.ts ou index.js e espera um export default com PluginDefinition.
 */
async function importPlugin(pluginDir: string): Promise<PluginDefinition> {
  const candidates = ['index.ts', 'index.js', 'plugin.ts', 'plugin.js']
  let entryPath: string | null = null

  for (const file of candidates) {
    const fullPath = join(pluginDir, file)
    if (existsSync(fullPath)) {
      entryPath = fullPath
      break
    }
  }

  if (!entryPath) {
    throw new Error(`Nenhum entry point encontrado (${candidates.join(', ')})`)
  }

  const mod = await import(entryPath)
  const definition: PluginDefinition = mod.default ?? mod

  if (!definition.name || !definition.version || !definition.onLoad) {
    throw new Error(`Plugin inválido: deve ter name, version e onLoad`)
  }

  return definition
}

/**
 * Reimporta um plugin do path original (para hot-reload).
 * Usa cache-busting com query param de timestamp.
 */
async function reimportPlugin(loaded: LoadedPlugin): Promise<PluginDefinition> {
  if (!loaded.path) {
    throw new Error(
      `Plugin '${loaded.definition.name}' não tem path — passe newDefinition no reload()`,
    )
  }

  // Cache-busting: Bun/Node cacheiam imports, o timestamp força reimport
  const cacheBuster = `?t=${Date.now()}`
  const candidates = ['index.ts', 'index.js', 'plugin.ts', 'plugin.js']

  for (const file of candidates) {
    const fullPath = join(loaded.path, file)
    if (existsSync(fullPath)) {
      const mod = await import(`${fullPath}${cacheBuster}`)
      return mod.default ?? mod
    }
  }

  throw new Error(`Entry point não encontrado em ${loaded.path}`)
}

/**
 * Cria um logger prefixado com o nome do plugin.
 */
function createLogger(pluginName: string): PluginLogger {
  const prefix = `[plugin:${pluginName}]`
  return {
    // eslint-disable-next-line no-console
    info: (msg: string) => console.log(`${prefix} ${msg}`),
    // eslint-disable-next-line no-console
    warn: (msg: string) => console.warn(`${prefix} ${msg}`),
    // eslint-disable-next-line no-console
    error: (msg: string) => console.error(`${prefix} ${msg}`),
  }
}
