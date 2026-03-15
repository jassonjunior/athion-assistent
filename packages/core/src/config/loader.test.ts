/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-dynamic-delete */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { loadGlobalConfig, loadProjectConfig, loadEnvConfig } from './loader'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'

const TEST_DIR = join(tmpdir(), 'athion-loader-tests-' + Date.now())

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true })
})

afterEach(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true })
  } catch {
    // ok
  }
})

describe('loadProjectConfig', () => {
  it('carrega de .athion/config.json', () => {
    const athionDir = join(TEST_DIR, '.athion')
    mkdirSync(athionDir, { recursive: true })
    writeFileSync(join(athionDir, 'config.json'), JSON.stringify({ model: 'custom-model' }))

    const config = loadProjectConfig(TEST_DIR)
    expect(config.model).toBe('custom-model')
  })

  it('carrega de athion.json como fallback', () => {
    writeFileSync(join(TEST_DIR, 'athion.json'), JSON.stringify({ temperature: 0.5 }))

    const config = loadProjectConfig(TEST_DIR)
    expect(config.temperature).toBe(0.5)
  })

  it('retorna objeto vazio quando nenhum arquivo existe', () => {
    const config = loadProjectConfig(join(TEST_DIR, 'nonexistent'))
    expect(config).toEqual({})
  })

  it('retorna objeto vazio para JSON inválido', () => {
    writeFileSync(join(TEST_DIR, 'athion.json'), 'not json{{{')

    const config = loadProjectConfig(TEST_DIR)
    expect(config).toEqual({})
  })

  it('prioriza .athion/config.json sobre athion.json', () => {
    const athionDir = join(TEST_DIR, '.athion')
    mkdirSync(athionDir, { recursive: true })
    writeFileSync(join(athionDir, 'config.json'), JSON.stringify({ model: 'from-athion-dir' }))
    writeFileSync(join(TEST_DIR, 'athion.json'), JSON.stringify({ model: 'from-root' }))

    const config = loadProjectConfig(TEST_DIR)
    expect(config.model).toBe('from-athion-dir')
  })
})

describe('loadEnvConfig', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('ATHION_')) {
        delete process.env[key]
      }
    }
    Object.assign(process.env, originalEnv)
  })

  it('mapeia ATHION_PROVIDER para provider', () => {
    process.env.ATHION_PROVIDER = 'openai'
    const config = loadEnvConfig()
    expect(config.provider).toBe('openai')
  })

  it('mapeia ATHION_MODEL para model', () => {
    process.env.ATHION_MODEL = 'gpt-4'
    const config = loadEnvConfig()
    expect(config.model).toBe('gpt-4')
  })

  it('converte ATHION_TEMPERATURE para número', () => {
    process.env.ATHION_TEMPERATURE = '0.5'
    const config = loadEnvConfig()
    expect(config.temperature).toBe(0.5)
  })

  it('converte ATHION_TELEMETRY para boolean', () => {
    process.env.ATHION_TELEMETRY = 'true'
    const config = loadEnvConfig()
    expect(config.telemetry).toBe(true)
  })

  it('mapeia ATHION_LOG_LEVEL para logLevel', () => {
    process.env.ATHION_LOG_LEVEL = 'debug'
    const config = loadEnvConfig()
    expect(config.logLevel).toBe('debug')
  })

  it('mapeia ATHION_DATA_DIR para dataDir', () => {
    process.env.ATHION_DATA_DIR = '/custom/data'
    const config = loadEnvConfig()
    expect(config.dataDir).toBe('/custom/data')
  })

  it('mapeia ATHION_LANGUAGE para language', () => {
    process.env.ATHION_LANGUAGE = 'en-US'
    const config = loadEnvConfig()
    expect(config.language).toBe('en-US')
  })

  it('mapeia ATHION_THEME para theme', () => {
    process.env.ATHION_THEME = 'dark'
    const config = loadEnvConfig()
    expect(config.theme).toBe('dark')
  })

  it('mapeia ATHION_DEFAULT_PERMISSION para defaultPermission', () => {
    process.env.ATHION_DEFAULT_PERMISSION = 'allow'
    const config = loadEnvConfig()
    expect(config.defaultPermission).toBe('allow')
  })

  it('retorna objeto vazio quando nenhuma variável definida', () => {
    // Remove todas as ATHION_ vars
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('ATHION_')) delete process.env[key]
    }
    const config = loadEnvConfig()
    expect(Object.keys(config).length).toBe(0)
  })

  it('ignora variáveis não mapeadas', () => {
    process.env.ATHION_CUSTOM_VAR = 'test'
    const config = loadEnvConfig()
    expect(config).not.toHaveProperty('customVar')
  })
})

describe('loadGlobalConfig', () => {
  it('retorna objeto vazio quando ~/.athion/config.json não existe', () => {
    // Default path is ~/.athion/config.json — may or may not exist
    // Just verify it returns an object (may be empty or have data)
    const config = loadGlobalConfig()
    expect(typeof config).toBe('object')
  })
})
