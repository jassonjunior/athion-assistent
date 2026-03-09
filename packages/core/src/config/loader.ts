import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Config } from './schema'

/**
 * Carrega a configuração global do usuário
 * @returns {Partial<Config>} A configuração global do usuário
 */
export function loadGlobalConfig(): Partial<Config> {
  const configPath = join(homedir(), '.athion', 'config.json')
  return loadJsonFile(configPath)
}

/**
 * Carrega a configuração do projeto
 * @param {string} projectDir - O diretório do projeto
 * @returns {Partial<Config>} A configuração do projeto
 */
export function loadProjectConfig(projectDir: string = process.cwd()): Partial<Config> {
  const paths = [join(projectDir, '.athion', 'config.json'), join(projectDir, 'athion.json')]

  for (const configPath of paths) {
    const config = loadJsonFile(configPath)
    if (Object.keys(config).length > 0) return config
  }

  return {}
}

/**
 * Mapeia as variáveis de ambiente para as chaves da configuração
 * @returns {Record<string, keyof Config>} Mapeia as variáveis de ambiente para as chaves da configuração
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

/**
 * Carrega a configuração das variáveis de ambiente
 * @returns {Partial<Config>} A configuração das variáveis de ambiente
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

/**
 * Carrega a configuração de um arquivo JSON
 * @param {string} filePath - O caminho do arquivo JSON
 * @returns {Partial<Config>} A configuração do arquivo JSON
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
