import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Config } from './schema'

/** loadGlobalConfig
 * Descrição: Carrega a configuração global do usuário a partir de ~/.athion/config.json.
 * Retorna objeto vazio se o arquivo não existir ou for inválido.
 * @returns Configuração parcial carregada do arquivo global
 */
export function loadGlobalConfig(): Partial<Config> {
  const configPath = join(homedir(), '.athion', 'config.json')
  return loadJsonFile(configPath)
}

/** loadProjectConfig
 * Descrição: Carrega a configuração do projeto a partir de .athion/config.json ou athion.json
 * no diretório do projeto. Retorna o primeiro arquivo encontrado com conteúdo.
 * @param projectDir - Diretório raiz do projeto (default: process.cwd())
 * @returns Configuração parcial carregada do arquivo de projeto
 */
export function loadProjectConfig(projectDir: string = process.cwd()): Partial<Config> {
  const paths = [join(projectDir, '.athion', 'config.json'), join(projectDir, 'athion.json')]

  for (const configPath of paths) {
    const config = loadJsonFile(configPath)
    if (Object.keys(config).length > 0) return config
  }

  return {}
}

/** ENV_MAP
 * Descrição: Mapeamento de variáveis de ambiente ATHION_* para chaves da configuração.
 * Usado pelo loadEnvConfig para converter variáveis de ambiente em configurações tipadas.
 */
const ENV_MAP: Record<string, keyof Config> = {
  ATHION_PROVIDER: 'provider',
  ATHION_MODEL: 'model',
  ATHION_TEMPERATURE: 'temperature',
  ATHION_DATA_DIR: 'dataDir',
  ATHION_LOG_LEVEL: 'logLevel',
  ATHION_TELEMETRY: 'telemetry',
  ATHION_LANGUAGE: 'language',
  ATHION_THEME: 'theme',
  ATHION_DEFAULT_PERMISSION: 'defaultPermission',
}

/** loadEnvConfig
 * Descrição: Carrega configurações a partir de variáveis de ambiente ATHION_*.
 * Converte valores numéricos e booleanos automaticamente.
 * @returns Configuração parcial carregada das variáveis de ambiente
 */
export function loadEnvConfig(): Partial<Config> {
  const config: Record<string, unknown> = {}

  for (const [envKey, configKey] of Object.entries(ENV_MAP)) {
    const value = process.env[envKey]
    if (value === undefined) continue

    if (configKey === 'temperature') {
      config[configKey] = Number(value)
    } else if (configKey === 'telemetry') {
      config[configKey] = value === 'true'
    } else {
      config[configKey] = value
    }
  }

  return config as Partial<Config>
}

/** loadJsonFile
 * Descrição: Carrega e faz parse de um arquivo JSON de configuração.
 * Retorna objeto vazio se o arquivo não existir ou tiver JSON inválido.
 * @param filePath - Caminho absoluto do arquivo JSON
 * @returns Configuração parcial carregada do arquivo
 */
function loadJsonFile(filePath: string): Partial<Config> {
  if (!existsSync(filePath)) return {}

  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as Partial<Config>
  } catch {
    return {}
  }
}
