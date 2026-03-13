import { loadEnvConfig, loadGlobalConfig, loadProjectConfig } from './loader'
import type { Config } from './schema'
import { ConfigSchema, DEFAULT_CONFIG } from './schema'

/** ConfigChangeCallback
 * Descrição: Callback chamado quando uma configuração é alterada em runtime.
 * @param key - Nome da chave que foi alterada (ex: 'provider', 'model')
 * @param value - Novo valor atribuído à chave
 */
type ConfigChangeCallback = (key: string, value: unknown) => void

/** ConfigManager
 * Descrição: Interface pública para gerenciar configurações do Athion.
 * Centraliza todas as configurações do sistema, unificando 5 fontes
 * (defaults, global, project, env, CLI args) em um único objeto validado por Zod.
 */
export interface ConfigManager {
  /** get
   * Descrição: Retorna o valor de uma chave específica da configuração.
   * @param key - Chave da configuração (ex: 'provider', 'model', 'temperature')
   * @returns O valor atual daquela chave, já tipado corretamente
   */
  get<K extends keyof Config>(key: K): Config[K]

  /** getAll
   * Descrição: Retorna uma cópia congelada (read-only) de toda a configuração.
   * O objeto retornado não pode ser modificado diretamente.
   * @returns Objeto Config completo e imutável
   */
  getAll(): Readonly<Config>

  /** set
   * Descrição: Altera o valor de uma chave em runtime.
   * Notifica todos os listeners registrados via onChanged.
   * Não persiste a alteração — vale apenas para a sessão atual.
   * @param key - Chave da configuração a ser alterada
   * @param value - Novo valor (deve ser compatível com o tipo da chave)
   */
  set<K extends keyof Config>(key: K, value: Config[K]): void

  /** reload
   * Descrição: Recarrega a configuração de todas as fontes (global, project, env).
   * Útil quando o usuário edita um arquivo de config durante a sessão.
   * Os CLI args originais são mantidos (continuam com maior prioridade).
   */
  reload(): void

  /** onChanged
   * Descrição: Registra um callback que será chamado sempre que uma config mudar.
   * @param callback - Função chamada com (key, value) a cada mudança
   * @returns Função de unsubscribe para parar de receber notificações
   */
  onChanged: (callback: ConfigChangeCallback) => () => void
}

/** createConfigManager
 * Descrição: Cria uma instância do ConfigManager resolvendo a configuração final
 * por merge de 5 fontes em ordem de prioridade (defaults < global < project < env < CLI args).
 * O resultado é validado pelo Zod.
 * @param cliArgs - Configurações passadas via linha de comando (maior prioridade)
 * @returns Instância do ConfigManager pronta para uso
 */
export function createConfigManager(cliArgs: Partial<Config> = {}): ConfigManager {
  const listeners: Set<ConfigChangeCallback> = new Set()
  let current: Config = resolve(cliArgs)

  /** resolve
   * Descrição: Resolve a configuração final fazendo merge das 5 fontes e validação Zod.
   * @param args - CLI args (nível 5, maior prioridade)
   * @returns Configuração completa e validada
   */
  function resolve(args: Partial<Config>): Config {
    const merged = {
      ...DEFAULT_CONFIG,
      ...loadGlobalConfig(),
      ...loadProjectConfig(),
      ...loadEnvConfig(),
      ...args,
    }

    return ConfigSchema.parse(merged)
  }

  /** get
   * Descrição: Retorna o valor de uma chave específica da configuração.
   * @param key - Chave da configuração (ex: 'provider', 'model', 'temperature')
   * @returns O valor atual daquela chave, já tipado corretamente
   */
  function get<K extends keyof Config>(key: K): Config[K] {
    return current[key]
  }

  /** getAll
   * Descrição: Retorna uma cópia congelada (read-only) de toda a configuração.
   * @returns Objeto Config completo e imutável
   */
  function getAll(): Readonly<Config> {
    return Object.freeze({ ...current })
  }

  /** set
   * Descrição: Altera o valor de uma chave em runtime e notifica listeners.
   * Não persiste a alteração — vale apenas para a sessão atual.
   * @param key - Chave da configuração a ser alterada
   * @param value - Novo valor (deve ser compatível com o tipo da chave)
   */
  function set<K extends keyof Config>(key: K, value: Config[K]): void {
    const previous = current[key]
    if (previous === value) return

    current = { ...current, [key]: value }
    for (const listener of listeners) {
      listener(key, value)
    }
  }

  /** reload
   * Descrição: Recarrega a configuração de todas as fontes (global, project, env).
   * Os CLI args originais são mantidos com maior prioridade.
   */
  function reload(): void {
    current = resolve(cliArgs)
  }

  /** onChanged
   * Descrição: Registra um callback que será chamado sempre que uma config mudar.
   * @param callback - Função chamada com (key, value) a cada mudança
   * @returns Função de unsubscribe para parar de receber notificações
   */
  function onChanged(callback: ConfigChangeCallback): () => void {
    listeners.add(callback)
    return () => listeners.delete(callback)
  }

  return { get, getAll, set, reload, onChanged }
}
