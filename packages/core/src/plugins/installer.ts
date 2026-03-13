import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** PluginSearchResult
 * Descrição: Resultado de uma busca de plugins no npm
 */
export interface PluginSearchResult {
  /** packageName
   * Descrição: Nome do pacote no npm (ex: 'athion-plugin-git-tools')
   */
  packageName: string
  /** pluginName
   * Descrição: Nome do plugin sem prefixo (ex: 'git-tools')
   */
  pluginName: string
  /** description
   * Descrição: Descrição do pacote npm
   */
  description: string
  /** version
   * Descrição: Versão mais recente disponível
   */
  version: string
  /** author
   * Descrição: Autor do pacote
   */
  author?: string | undefined
}

/** InstallResult
 * Descrição: Resultado de uma operação de instalação ou desinstalação de plugin
 */
export interface InstallResult {
  /** success
   * Descrição: Se a operação foi bem-sucedida
   */
  success: boolean
  /** pluginName
   * Descrição: Nome do plugin processado
   */
  pluginName: string
  /** packageName
   * Descrição: Nome do pacote npm correspondente
   */
  packageName: string
  /** installedPath
   * Descrição: Caminho onde o plugin foi instalado (apenas quando sucesso)
   */
  installedPath?: string
  /** error
   * Descrição: Mensagem de erro (apenas quando falha)
   */
  error?: string
}

/** InstallerOptions
 * Descrição: Opções de configuração do installer de plugins
 */
export interface InstallerOptions {
  /** pluginsDir
   * Descrição: Diretório de plugins (default: ~/.athion/plugins)
   */
  pluginsDir?: string
  /** timeout
   * Descrição: Timeout para comandos npm/bun em milissegundos (default: 60000)
   */
  timeout?: number
}

/** createPluginInstaller
 * Descrição: Cria um PluginInstaller que busca e instala plugins do npm.
 * Convenção: plugins são pacotes npm com prefixo `athion-plugin-`.
 * O installer usa `bun` como package manager (fallback para npm).
 * @param options - Configuração do installer (diretório, timeout)
 * @returns Objeto com métodos search, install, uninstall e listInstalled
 */
export function createPluginInstaller(options: InstallerOptions = {}) {
  const { pluginsDir = '~/.athion/plugins', timeout = 60_000 } = options

  const resolvedDir = resolve(pluginsDir.replace('~', process.env.HOME ?? '.'))

  /** search
   * Descrição: Busca plugins disponíveis no npm pelo prefixo `athion-plugin-`
   * @param query - Termo de busca adicional (ex: 'git', 'docker')
   * @returns Lista de plugins encontrados no npm
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

  /** install
   * Descrição: Instala um plugin do npm no diretório de plugins usando bun
   * @param nameOrPackage - Nome do plugin ('git-tools') ou pacote npm ('athion-plugin-git-tools')
   * @returns Resultado da instalação com status e caminho
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

  /** uninstall
   * Descrição: Desinstala um plugin removendo o pacote npm e o diretório local
   * @param nameOrPackage - Nome do plugin ou pacote npm a desinstalar
   * @returns Resultado da desinstalação com status
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

  /** listInstalled
   * Descrição: Lista os plugins instalados no diretório de plugins
   * @returns Array com os nomes dos diretórios de plugins encontrados
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
