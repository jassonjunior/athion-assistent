import { loadEnvConfig, loadGlobalConfig, loadProjectConfig } from './loader'
import type { Config } from './schema'
import { ConfigSchema, DEFAULT_CONFIG } from './schema'

/**
 * Callback chamado quando uma configuração é alterada.
 * @param key - Nome da chave que foi alterada (ex: 'provider', 'model')
 * @param value - Novo valor atribuído à chave
 */
type ConfigChangeCallback = (key: string, value: unknown) => void

/**
 * Interface do ConfigManager — API pública para gerenciar configurações.
 *
 * O ConfigManager centraliza todas as configurações do sistema,
 * unificando 5 fontes (defaults, global, project, env, CLI args)
 * em um único objeto validado por Zod.
 */
export interface ConfigManager {
  /**
   * Retorna o valor de uma chave específica da configuração.
   * @param key - Chave da configuração (ex: 'provider', 'model', 'temperature')
   * @returns O valor atual daquela chave, já tipado corretamente
   * @example
   * const model = config.get('model') // 'qwen3-coder-reap-40b-a3b'
   */
  get<K extends keyof Config>(key: K): Config[K]

  /**
   * Retorna uma cópia congelada (read-only) de toda a configuração.
   * O objeto retornado não pode ser modificado diretamente.
   * @returns Objeto Config completo, imutável
   * @example
   * const all = config.getAll()
   * // all.provider → 'vllm-mlx'
   * // all.model → 'qwen3-coder-reap-40b-a3b'
   */
  getAll(): Readonly<Config>

  /**
   * Altera o valor de uma chave em runtime.
   * Notifica todos os listeners registrados via onChanged.
   * Não persiste a alteração — vale apenas para a sessão atual.
   * @param key - Chave da configuração a ser alterada
   * @param value - Novo valor (deve ser compatível com o tipo da chave)
   * @example
   * config.set('temperature', 0.9)
   */
  set<K extends keyof Config>(key: K, value: Config[K]): void

  /**
   * Recarrega a configuração de todas as fontes (global, project, env).
   * Útil quando o usuário edita um arquivo de config durante a sessão.
   * Os CLI args originais são mantidos (continuam com maior prioridade).
   */
  reload(): void

  /**
   * Registra um callback que será chamado sempre que uma config mudar.
   * @param callback - Função chamada com (key, value) a cada mudança
   * @returns Função de unsubscribe — chame para parar de receber notificações
   * @example
   * const unsubscribe = config.onChanged((key, value) => {
   *   console.log(`${key} mudou para ${value}`)
   * })
   * // Quando não precisar mais:
   * unsubscribe()
   */
  onChanged: (callback: ConfigChangeCallback) => () => void
}

/**
 * Cria uma instância do ConfigManager.
 *
 * Resolve a configuração final fazendo merge de 5 fontes na ordem de prioridade
 * (da menor para a maior):
 * 1. Defaults — valores padrão definidos no Zod schema
 * 2. Global — arquivo ~/.athion/config.json
 * 3. Project — arquivo .athion/config.json ou athion.json no diretório do projeto
 * 4. Environment — variáveis de ambiente ATHION_*
 * 5. CLI args — argumentos passados na linha de comando
 *
 * O resultado é validado pelo Zod — se algum valor for inválido, lança erro.
 *
 * @param cliArgs - Configurações passadas via linha de comando (maior prioridade)
 * @returns Instância do ConfigManager pronta para uso
 * @throws {ZodError} Se a configuração final não passar na validação do schema
 * @example
 * const config = createConfigManager({ model: 'gpt-4o' })
 * config.get('model') // 'gpt-4o' (CLI arg sobrescreve tudo)
 * config.get('provider') // 'vllm-mlx' (default, pois não foi sobrescrito)
 */
export function createConfigManager(cliArgs: Partial<Config> = {}): ConfigManager {
  const listeners: Set<ConfigChangeCallback> = new Set()
  let current: Config = resolve(cliArgs)

  /**
   * Resolve a configuração final fazendo merge das 5 fontes.
   * Usa spread operator — cada nível sobrescreve o anterior.
   * Valida o resultado com Zod antes de retornar.
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

  /**
   * Retorna o valor de uma chave específica da configuração.
   * @param key - Chave da configuração (ex: 'provider', 'model', 'temperature')
   * @returns O valor atual daquela chave, já tipado corretamente
   * @example
   * const model = config.get('model') // 'qwen3-coder-reap-40b-a3b'
   */
  function get<K extends keyof Config>(key: K): Config[K] {
    return current[key]
  }

  /**
   * Retorna uma cópia congelada (read-only) de toda a configuração.
   * O objeto retornado não pode ser modificado diretamente.
   * @returns Objeto Config completo, imutável
   * @example
   * const all = config.getAll()
   * // all.provider → 'vllm-mlx'
   * // all.model → 'qwen3-coder-reap-40b-a3b'
   */
  function getAll(): Readonly<Config> {
    return Object.freeze({ ...current })
  }

  /**
   * Altera o valor de uma chave em runtime.
   * Notifica todos os listeners registrados via onChanged.
   * Não persiste a alteração — vale apenas para a sessão atual.
   * @param key - Chave da configuração a ser alterada
   * @param value - Novo valor (deve ser compatível com o tipo da chave)
   * @example
   * config.set('temperature', 0.9)
   */
  function set<K extends keyof Config>(key: K, value: Config[K]): void {
    const previous = current[key]
    if (previous === value) return

    current = { ...current, [key]: value }
    for (const listener of listeners) {
      listener(key, value)
    }
  }

  /**
   * Recarrega a configuração de todas as fontes (global, project, env).
   * Útil quando o usuário edita um arquivo de config durante a sessão.
   * Os CLI args originais são mantidos (continuam com maior prioridade).
   */
  function reload(): void {
    current = resolve(cliArgs)
  }

  /**
   * Registra um callback que será chamado sempre que uma config mudar.
   * @param callback - Função chamada com (key, value) a cada mudança
   * @returns Função de unsubscribe — chame para parar de receber notificações
   * @example
   * const unsubscribe = config.onChanged((key, value) => {
   *   console.log(`${key} mudou para ${value}`)
   * })
   * // Quando não precisar mais:
   * unsubscribe()
   */
  function onChanged(callback: ConfigChangeCallback): () => void {
    listeners.add(callback)
    return () => listeners.delete(callback)
  }

  return { get, getAll, set, reload, onChanged }
}
