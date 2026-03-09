import type { Bus } from '../bus/bus'
import type { ConfigManager } from '../config'
import type { ProviderLayer } from '../provider'
import type { ToolRegistry } from '../tools/types'

/**
 * Contexto injetado no plugin durante onLoad.
 * O plugin usa esse objeto para interagir com o core do Athion.
 * Não expõe o orchestrator diretamente — plugins operam via bus, tools e config.
 */
export interface PluginContext {
  /** Bus de eventos — subscribe/publish para reagir a eventos do sistema */
  bus: Bus
  /** Configuração do sistema — leitura e escrita em runtime */
  config: ConfigManager
  /** Registry de tools — registrar novas tools para o LLM usar */
  tools: ToolRegistry
  /** Provider layer — acessar modelos LLM (listProviders, generateText, etc.) */
  provider: ProviderLayer
  /** Logger simples para o plugin emitir mensagens */
  log: PluginLogger
}

/**
 * Logger disponível para plugins.
 * Prefixado automaticamente com o nome do plugin.
 */
export interface PluginLogger {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

/**
 * Definição de um plugin Athion.
 *
 * Um plugin é um módulo que exporta um objeto com:
 * - `name` e `version` para identificação
 * - `onLoad()` chamado quando o plugin é carregado (registra tools, listeners, etc.)
 * - `onUnload()` chamado quando o plugin é removido (cleanup)
 *
 * O plugin recebe um `PluginContext` com acesso controlado ao core.
 * Tudo que o plugin registra (tools, event listeners) deve ser desregistrado em onUnload.
 *
 * @example
 * // ~/.athion/plugins/my-plugin/index.ts
 * export default {
 *   name: 'my-plugin',
 *   version: '1.0.0',
 *   description: 'Adds a hello_world tool',
 *   async onLoad(ctx) {
 *     ctx.tools.register({
 *       name: 'hello_world',
 *       description: 'Says hello',
 *       parameters: z.object({ name: z.string() }),
 *       execute: async ({ name }) => ({ success: true, data: `Hello, ${name}!` }),
 *     })
 *     ctx.log.info('Loaded!')
 *   },
 *   async onUnload(ctx) {
 *     ctx.tools.unregister('hello_world')
 *     ctx.log.info('Unloaded!')
 *   },
 * }
 */
export interface PluginDefinition {
  /** Identificador único do plugin (ex: 'my-plugin', 'git-tools') */
  name: string
  /** Versão semver do plugin (ex: '1.0.0') */
  version: string
  /** Descrição curta do que o plugin faz */
  description?: string
  /** Chamado ao carregar o plugin — registra tools, listeners, etc. */
  onLoad: (ctx: PluginContext) => Promise<void> | void
  /** Chamado ao descarregar — cleanup de tools, listeners, etc. */
  onUnload?: (ctx: PluginContext) => Promise<void> | void
}

/**
 * Estado de um plugin carregado no sistema.
 * Tracking interno do PluginManager.
 */
export interface LoadedPlugin {
  /** Definição original do plugin */
  definition: PluginDefinition
  /** Caminho do diretório do plugin no filesystem (se carregado de disco) */
  path?: string | undefined
  /** Timestamp de quando foi carregado */
  loadedAt: number
  /** Tools registradas por este plugin (para cleanup automático) */
  registeredTools: string[]
  /** Unsubscribe functions de eventos do bus (para cleanup automático) */
  busUnsubscribes: Array<() => void>
}

/**
 * Interface pública do PluginManager.
 * Gerencia o ciclo de vida dos plugins: load, unload, hot-reload.
 */
export interface PluginManager {
  /**
   * Carrega um plugin a partir de sua definição.
   * Chama onLoad() e rastreia tudo que o plugin registrou.
   * @param definition - Definição do plugin
   * @param sourcePath - Caminho opcional de onde foi carregado
   * @throws Se já existir um plugin com o mesmo nome
   */
  load(definition: PluginDefinition, sourcePath?: string): Promise<void>

  /**
   * Descarrega um plugin pelo nome.
   * Chama onUnload() e remove automaticamente tools e listeners registrados.
   * @param name - Nome do plugin a remover
   */
  unload(name: string): Promise<void>

  /**
   * Hot-reload: descarrega e recarrega um plugin.
   * @param name - Nome do plugin a recarregar
   * @param newDefinition - Nova definição (se omitida, reimporta do path original)
   */
  reload(name: string, newDefinition?: PluginDefinition): Promise<void>

  /**
   * Carrega todos os plugins de um diretório.
   * Espera que cada subdiretório tenha um index.ts/index.js com export default.
   * @param dir - Caminho do diretório de plugins (ex: ~/.athion/plugins/)
   */
  loadFromDirectory(dir: string): Promise<void>

  /**
   * Retorna a lista de plugins carregados.
   */
  list(): LoadedPlugin[]

  /**
   * Busca um plugin carregado pelo nome.
   * @param name - Nome do plugin
   */
  get(name: string): LoadedPlugin | undefined

  /**
   * Verifica se um plugin está carregado.
   * @param name - Nome do plugin
   */
  has(name: string): boolean
}
