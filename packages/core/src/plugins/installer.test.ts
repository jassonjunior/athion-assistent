/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createPluginInstaller } from './installer'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'

const TEST_DIR = join(tmpdir(), 'athion-installer-tests-' + Date.now())

beforeEach(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true })
  } catch {
    // ok
  }
  mkdirSync(TEST_DIR, { recursive: true })
})

describe('createPluginInstaller', () => {
  describe('listInstalled', () => {
    it('retorna array vazio quando diretório não existe', () => {
      const installer = createPluginInstaller({
        pluginsDir: join(TEST_DIR, 'nonexistent'),
      })
      expect(installer.listInstalled()).toEqual([])
    })

    it('lista diretórios de plugins ignorando node_modules', () => {
      const pluginsDir = join(TEST_DIR, 'plugins')
      mkdirSync(pluginsDir, { recursive: true })
      mkdirSync(join(pluginsDir, 'my-plugin'))
      mkdirSync(join(pluginsDir, 'other-plugin'))
      mkdirSync(join(pluginsDir, 'node_modules'))

      const installer = createPluginInstaller({ pluginsDir })
      const installed = installer.listInstalled()

      expect(installed).toContain('my-plugin')
      expect(installed).toContain('other-plugin')
      expect(installed).not.toContain('node_modules')
    })

    it('ignora arquivos, retorna apenas diretórios', () => {
      const pluginsDir = join(TEST_DIR, 'plugins-files')
      mkdirSync(pluginsDir, { recursive: true })
      mkdirSync(join(pluginsDir, 'real-plugin'))
      writeFileSync(join(pluginsDir, 'not-a-dir.txt'), 'hello')

      const installer = createPluginInstaller({ pluginsDir })
      const installed = installer.listInstalled()

      expect(installed).toEqual(['real-plugin'])
    })
  })

  describe('install', () => {
    it('retorna erro se plugin já está instalado', async () => {
      const pluginsDir = join(TEST_DIR, 'plugins-dup')
      mkdirSync(pluginsDir, { recursive: true })
      mkdirSync(join(pluginsDir, 'my-plugin'))

      const installer = createPluginInstaller({ pluginsDir })
      const result = await installer.install('my-plugin')

      expect(result.success).toBe(false)
      expect(result.error).toContain('já está instalado')
      expect(result.pluginName).toBe('my-plugin')
      expect(result.packageName).toBe('athion-plugin-my-plugin')
    })

    it('normaliza nome com prefixo athion-plugin-', async () => {
      const pluginsDir = join(TEST_DIR, 'plugins-norm')
      mkdirSync(pluginsDir, { recursive: true })
      mkdirSync(join(pluginsDir, 'git-tools'))

      const installer = createPluginInstaller({ pluginsDir })

      // Passando nome com prefixo
      const result = await installer.install('athion-plugin-git-tools')
      expect(result.pluginName).toBe('git-tools')
      expect(result.packageName).toBe('athion-plugin-git-tools')
    })
  })

  describe('search', () => {
    it('retorna array vazio em caso de falha no npm', async () => {
      // search depende de Bun.spawn que não existe no vitest/node
      // O catch retorna []
      const installer = createPluginInstaller({ pluginsDir: TEST_DIR })
      const results = await installer.search('nonexistent-query')
      expect(Array.isArray(results)).toBe(true)
    })
  })

  describe('uninstall', () => {
    it('normaliza nome do pacote para uninstall', async () => {
      const installer = createPluginInstaller({ pluginsDir: TEST_DIR })
      // uninstall vai tentar chamar Bun.spawn que vai falhar mas deve retornar resultado
      const result = await installer.uninstall('test')
      expect(result.pluginName).toBe('test')
      expect(result.packageName).toBe('athion-plugin-test')
    })
  })
})
