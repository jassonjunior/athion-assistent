import type { Bus } from '../bus/bus'
import type { ConfigManager } from '../config'
import type { ProviderLayer } from '../provider'
import type { ToolRegistry } from '../tools/types'

/** PluginContext
 * Descrição: Contexto injetado no plugin durante onLoad.
 * O plugin usa esse objeto para interagir com o core do Athion.
 * Não expõe o orchestrator diretamente — plugins operam via bus, tools e config.
 */
export interface PluginContext {
  /** bus
   * Descrição: Bus de eventos — subscribe/publish para reagir a eventos do sistema
   */
  bus: Bus
  /** config
   * Descrição: Configuração do sistema — leitura e escrita em runtime
   */
  config: ConfigManager
  /** tools
   * Descrição: Registry de tools — registrar novas tools para o LLM usar
   */
  tools: ToolRegistry
  /** provider
   * Descrição: Provider layer — acessar modelos LLM (listProviders, generateText, etc.)
   */
  provider: ProviderLayer
  /** log
   * Descrição: Logger simples para o plugin emitir mensagens
   */
  log: PluginLogger
}

/** PluginLogger
 * Descrição: Logger disponível para plugins. Prefixado automaticamente com o nome do plugin.
 */
export interface PluginLogger {
  /** info
   * Descrição: Emite mensagem de nível informativo
   * @param message - Mensagem a ser logada
   */
  info(message: string): void
  /** warn
   * Descrição: Emite mensagem de nível aviso
   * @param message - Mensagem a ser logada
   */
  warn(message: string): void
  /** error
   * Descrição: Emite mensagem de nível erro
   * @param message - Mensagem a ser logada
   */
  error(message: string): void
}

/** PluginDefinition
 * Descrição: Definição de um plugin Athion. Um plugin é um módulo que exporta um
 * objeto com name, version, onLoad (chamado ao carregar) e opcionalmente onUnload
 * (chamado ao remover). O plugin recebe um PluginContext com acesso controlado ao core.
 */
export interface PluginDefinition {
  /** name
   * Descrição: Identificador único do plugin (ex: 'my-plugin', 'git-tools')
   */
  name: string
  /** version
   * Descrição: Versão semver do plugin (ex: '1.0.0')
   */
  version: string
  /** description
   * Descrição: Descrição curta do que o plugin faz
   */
  description?: string
  /** onLoad
   * Descrição: Chamado ao carregar o plugin — registra tools, listeners, etc.
   * @param ctx - Contexto do plugin com acesso ao core
   */
  onLoad: (ctx: PluginContext) => Promise<void> | void
  /** onUnload
   * Descrição: Chamado ao descarregar — cleanup de tools, listeners, etc.
   * @param ctx - Contexto do plugin com acesso ao core
   */
  onUnload?: (ctx: PluginContext) => Promise<void> | void
}

/** LoadedPlugin
 * Descrição: Estado de um plugin carregado no sistema. Tracking interno do PluginManager.
 */
export interface LoadedPlugin {
  /** definition
   * Descrição: Definição original do plugin
   */
  definition: PluginDefinition
  /** path
   * Descrição: Caminho do diretório do plugin no filesystem (se carregado de disco)
   */
  path?: string | undefined
  /** loadedAt
   * Descrição: Timestamp de quando o plugin foi carregado
   */
  loadedAt: number
  /** registeredTools
   * Descrição: Nomes das tools registradas por este plugin (para cleanup automático)
   */
  registeredTools: string[]
  /** busUnsubscribes
   * Descrição: Funções de unsubscribe de eventos do bus (para cleanup automático)
   */
  busUnsubscribes: Array<() => void>
}

/** PluginManager
 * Descrição: Interface pública do PluginManager. Gerencia o ciclo de vida
 * dos plugins: load, unload, hot-reload.
 */
export interface PluginManager {
  /** load
   * Descrição: Carrega um plugin a partir de sua definição. Chama onLoad()
   * e rastreia tudo que o plugin registrou.
   * @param definition - Definição do plugin
   * @param sourcePath - Caminho opcional de onde foi carregado
   */
  load(definition: PluginDefinition, sourcePath?: string): Promise<void>

  /** unload
   * Descrição: Descarrega um plugin pelo nome. Chama onUnload() e remove
   * automaticamente tools e listeners registrados.
   * @param name - Nome do plugin a remover
   */
  unload(name: string): Promise<void>

  /** reload
   * Descrição: Hot-reload: descarrega e recarrega um plugin
   * @param name - Nome do plugin a recarregar
   * @param newDefinition - Nova definição (se omitida, reimporta do path original)
   */
  reload(name: string, newDefinition?: PluginDefinition): Promise<void>

  /** loadFromDirectory
   * Descrição: Carrega todos os plugins de um diretório. Espera que cada
   * subdiretório tenha um index.ts/index.js com export default.
   * @param dir - Caminho do diretório de plugins (ex: ~/.athion/plugins/)
   */
  loadFromDirectory(dir: string): Promise<void>

  /** list
   * Descrição: Retorna a lista de plugins carregados
   * @returns Array de plugins carregados com seus estados
   */
  list(): LoadedPlugin[]

  /** get
   * Descrição: Busca um plugin carregado pelo nome
   * @param name - Nome do plugin
   * @returns O plugin carregado ou undefined se não encontrado
   */
  get(name: string): LoadedPlugin | undefined

  /** has
   * Descrição: Verifica se um plugin está carregado
   * @param name - Nome do plugin
   * @returns true se o plugin está carregado
   */
  has(name: string): boolean
}
