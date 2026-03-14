/** CodebaseWatcher
 * Descrição: Observa mudanças no filesystem e emite eventos via Bus.
 * Usa fs.watch recursivo (Bun/Node 20+) com debounce por arquivo (1.5s).
 * Ignora node_modules, .git, dist, build, __pycache__.
 */

import { watch, type FSWatcher } from 'node:fs'
import { relative, resolve } from 'node:path'
import { existsSync } from 'node:fs'
import type { Bus } from '../bus/bus'
import { fileChangedEvent } from './events'
import { CODE_EXTENSIONS } from './file-walker'

/** IGNORED_DIRS
 * Descrição: Diretórios ignorados pelo watcher
 */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '__pycache__',
  '.turbo',
  '.next',
  '.cache',
])

/** DEFAULT_DEBOUNCE_MS
 * Descrição: Debounce padrão em milissegundos (1.5s)
 */
const DEFAULT_DEBOUNCE_MS = 1500

/** CodebaseWatcherConfig
 * Descrição: Configuração do watcher
 */
export interface CodebaseWatcherConfig {
  /** workspacePath - Diretório raiz do workspace */
  workspacePath: string
  /** bus - Event Bus para emissão de eventos */
  bus: Bus
  /** debounceMs - Tempo de debounce por arquivo (default: 1500) */
  debounceMs?: number
  /** extraIgnoredDirs - Diretórios adicionais a ignorar */
  extraIgnoredDirs?: string[]
}

/** CodebaseWatcher
 * Descrição: Observa mudanças em arquivos de código no workspace.
 * Debounce por arquivo evita múltiplas indexações durante saves.
 * Filtra apenas extensões de código reconhecidas.
 */
export class CodebaseWatcher {
  private watcher: FSWatcher | null = null
  private debounceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()
  private bus: Bus
  private workspacePath: string
  private debounceMs: number
  private ignoredDirs: Set<string>
  private running = false

  /** constructor
   * Descrição: Cria watcher com configuração de debounce e diretórios ignorados
   * @param config - Configuração do watcher
   */
  constructor(config: CodebaseWatcherConfig) {
    this.bus = config.bus
    this.workspacePath = resolve(config.workspacePath)
    this.debounceMs = config.debounceMs ?? DEFAULT_DEBOUNCE_MS
    this.ignoredDirs = new Set([...IGNORED_DIRS, ...(config.extraIgnoredDirs ?? [])])
  }

  /** start
   * Descrição: Inicia o watcher. Usa fs.watch recursivo.
   */
  start(): void {
    if (this.running) return

    this.watcher = watch(this.workspacePath, { recursive: true }, (eventType, filename) => {
      if (!filename) return
      const fullPath = resolve(this.workspacePath, filename)
      this.handleChange(fullPath, eventType)
    })

    this.running = true
  }

  /** stop
   * Descrição: Para o watcher e limpa timers de debounce
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
    this.running = false
  }

  /** isRunning
   * Descrição: Retorna se o watcher está ativo
   */
  isRunning(): boolean {
    return this.running
  }

  /** handleChange
   * Descrição: Processa um evento de mudança com debounce
   * @param filePath - Caminho completo do arquivo
   * @param eventType - Tipo de evento do fs.watch
   */
  private handleChange(filePath: string, eventType: string): void {
    // Filtra diretórios ignorados
    const rel = relative(this.workspacePath, filePath)
    const parts = rel.split('/')
    for (const part of parts) {
      if (this.ignoredDirs.has(part)) return
    }

    // Filtra apenas extensões de código
    const ext = filePath.substring(filePath.lastIndexOf('.'))
    if (!CODE_EXTENSIONS.has(ext)) return

    // Debounce por arquivo
    const existing = this.debounceTimers.get(filePath)
    if (existing) clearTimeout(existing)

    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath)
      const changeType = this.resolveChangeType(filePath, eventType)
      this.bus.publish(fileChangedEvent, { filePath, changeType })
    }, this.debounceMs)

    this.debounceTimers.set(filePath, timer)
  }

  /** resolveChangeType
   * Descrição: Determina o tipo de mudança (add, change, unlink)
   * @param filePath - Caminho do arquivo
   * @param eventType - Tipo do evento fs.watch
   * @returns Tipo de mudança normalizado
   */
  private resolveChangeType(filePath: string, eventType: string): 'add' | 'change' | 'unlink' {
    if (eventType === 'rename') {
      return existsSync(filePath) ? 'add' : 'unlink'
    }
    return 'change'
  }
}
