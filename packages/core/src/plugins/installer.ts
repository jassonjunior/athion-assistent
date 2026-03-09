import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * Resultado de uma busca de plugins no npm.
 */
export interface PluginSearchResult {
  /** Nome do pacote no npm (ex: 'athion-plugin-git-tools') */
  packageName: string
  /** Nome do plugin (sem prefixo, ex: 'git-tools') */
  pluginName: string
  /** Descrição do pacote */
  description: string
  /** Versão mais recente */
  version: string
  /** Autor */
  author?: string | undefined
}

/**
 * Resultado de uma instalação.
 */
export interface InstallResult {
  success: boolean
  pluginName: string
  packageName: string
  installedPath?: string
  error?: string
}

/**
 * Opções do installer.
 */
export interface InstallerOptions {
  /** Diretório de plugins (default: ~/.athion/plugins) */
  pluginsDir?: string
  /** Timeout para comandos npm/bun em ms (default: 60000) */
  timeout?: number
}

/**
 * Cria um PluginInstaller que busca e instala plugins do npm.
 *
 * Convenção: plugins são pacotes npm com prefixo `athion-plugin-`.
 * Ex: `athion-plugin-git-tools`, `athion-plugin-docker`, etc.
 *
 * O installer usa `bun` como package manager (fallback para npm).
 *
 * @param options - Configuração do installer
 */
export function createPluginInstaller(options: InstallerOptions = {}) {
  const { pluginsDir = '~/.athion/plugins', timeout = 60_000 } = options

  const resolvedDir = resolve(pluginsDir.replace('~', process.env.HOME ?? '.'))

  /**
   * Busca plugins disponíveis no npm pelo prefixo `athion-plugin-`.
   * @param query - Termo de busca adicional (ex: 'git', 'docker')
   * @returns Lista de plugins encontrados
   */
  async function search(query?: string): Promise<PluginSearchResult[]> {
    const searchTerm = query ? `athion-plugin-${query}` : 'athion-plugin-'
    const cmd = ['npm', 'search', searchTerm, '--json', '--no-description']

    try {
      const proc = Bun.spawn(cmd, { timeout, stdout: 'pipe', stderr: 'pipe' })
      const text = await new Response(proc.stdout).text()
      await proc.exited

      if (proc.exitCode !== 0) return []

      const results = JSON.parse(text) as Array<{
        name: string
        description: string
        version: string
        author?: { name?: string }
      }>

      return results
        .filter((r) => r.name.startsWith('athion-plugin-'))
        .map((r) => ({
          packageName: r.name,
          pluginName: r.name.replace('athion-plugin-', ''),
          description: r.description ?? '',
          version: r.version,
          author: r.author?.name,
        }))
    } catch {
      return []
    }
  }

  /**
   * Instala um plugin do npm no diretório de plugins.
   * @param nameOrPackage - Nome do plugin ('git-tools') ou pacote npm ('athion-plugin-git-tools')
   * @returns Resultado da instalação
   */
  async function install(nameOrPackage: string): Promise<InstallResult> {
    const packageName = nameOrPackage.startsWith('athion-plugin-')
      ? nameOrPackage
      : `athion-plugin-${nameOrPackage}`
    const pluginName = packageName.replace('athion-plugin-', '')
    const pluginPath = join(resolvedDir, pluginName)

    if (existsSync(pluginPath)) {
      return {
        success: false,
        pluginName,
        packageName,
        error: `Plugin '${pluginName}' já está instalado em ${pluginPath}`,
      }
    }

    try {
      // Usa bun para instalar no diretório de plugins
      // --cwd garante que instala no lugar certo
      const proc = Bun.spawn(['bun', 'add', packageName, '--cwd', resolvedDir], {
        timeout,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      await proc.exited

      if (proc.exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text()
        return {
          success: false,
          pluginName,
          packageName,
          error: `Falha ao instalar: ${stderr.trim()}`,
        }
      }

      // O pacote foi instalado em node_modules
      const nodeModulesPath = join(resolvedDir, 'node_modules', packageName)

      return {
        success: true,
        pluginName,
        packageName,
        installedPath: nodeModulesPath,
      }
    } catch (err) {
      return {
        success: false,
        pluginName,
        packageName,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /**
   * Desinstala um plugin.
   * @param nameOrPackage - Nome do plugin ou pacote npm
   */
  async function uninstall(nameOrPackage: string): Promise<InstallResult> {
    const packageName = nameOrPackage.startsWith('athion-plugin-')
      ? nameOrPackage
      : `athion-plugin-${nameOrPackage}`
    const pluginName = packageName.replace('athion-plugin-', '')

    try {
      const proc = Bun.spawn(['bun', 'remove', packageName, '--cwd', resolvedDir], {
        timeout,
        stdout: 'pipe',
        stderr: 'pipe',
      })
      await proc.exited

      // Remove diretório do plugin se existir
      const pluginPath = join(resolvedDir, pluginName)
      if (existsSync(pluginPath)) {
        const { rmSync } = await import('node:fs')
        rmSync(pluginPath, { recursive: true })
      }

      return { success: true, pluginName, packageName }
    } catch (err) {
      return {
        success: false,
        pluginName,
        packageName,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  /**
   * Lista plugins instalados no diretório.
   */
  function listInstalled(): string[] {
    if (!existsSync(resolvedDir)) return []
    return readdirSync(resolvedDir).filter((entry: string) => {
      const fullPath = join(resolvedDir, entry)
      return entry !== 'node_modules' && statSync(fullPath).isDirectory()
    })
  }

  return { search, install, uninstall, listInstalled }
}
