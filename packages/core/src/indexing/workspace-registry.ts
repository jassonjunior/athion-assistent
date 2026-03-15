/**
 * WorkspaceRegistry
 * Descrição: Gerencia workspaces registrados para indexação multi-workspace.
 * Persiste em ~/.athion/workspaces.json.
 * Cada workspace tem seu próprio index DB isolado (index-{hash8}.db).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createHash } from 'node:crypto'
import type { WorkspaceInfo, RemoteInfo } from './workspace-types.js'

const ATHION_DIR = join(homedir(), '.athion')
const REGISTRY_PATH = join(ATHION_DIR, 'workspaces.json')
const MAX_WORKSPACES = 5

/**
 * WorkspaceRegistry
 * Descrição: CRUD de workspaces registrados com persistência em JSON.
 */
export class WorkspaceRegistry {
  private workspaces: WorkspaceInfo[] = []

  constructor() {
    this.load()
  }

  /** list — Retorna todos os workspaces registrados */
  list(): WorkspaceInfo[] {
    return [...this.workspaces]
  }

  /** get — Busca workspace por ID */
  get(id: string): WorkspaceInfo | undefined {
    return this.workspaces.find((w) => w.id === id)
  }

  /** getByPath — Busca workspace pelo path absoluto */
  getByPath(path: string): WorkspaceInfo | undefined {
    return this.workspaces.find((w) => w.path === path)
  }

  /** add — Registra um novo workspace local */
  add(path: string, name?: string): WorkspaceInfo {
    const existing = this.getByPath(path)
    if (existing) return existing

    if (this.workspaces.length >= MAX_WORKSPACES) {
      throw new Error(`Maximum ${MAX_WORKSPACES} workspaces allowed`)
    }

    const id = hashPath(path)
    const info: WorkspaceInfo = {
      id,
      path,
      name: name ?? path.split('/').pop() ?? path,
      indexDbPath: join(ATHION_DIR, `index-${id}.db`),
      lastIndexed: new Date().toISOString(),
      isActive: true,
    }

    this.workspaces.push(info)
    this.save()
    return info
  }

  /** addRemote — Registra workspace de repositório remoto */
  addRemote(path: string, remote: RemoteInfo, name?: string): WorkspaceInfo {
    const info = this.add(path, name)
    info.remote = remote
    this.save()
    return info
  }

  /** remove — Remove workspace pelo ID */
  remove(id: string): boolean {
    const idx = this.workspaces.findIndex((w) => w.id === id)
    if (idx === -1) return false
    this.workspaces.splice(idx, 1)
    this.save()
    return true
  }

  /** updateLastIndexed — Atualiza timestamp de indexação */
  updateLastIndexed(id: string): void {
    const ws = this.get(id)
    if (ws) {
      ws.lastIndexed = new Date().toISOString()
      this.save()
    }
  }

  /** setActive — Ativa/desativa workspace */
  setActive(id: string, active: boolean): void {
    const ws = this.get(id)
    if (ws) {
      ws.isActive = active
      this.save()
    }
  }

  /** activeWorkspaces — Retorna apenas workspaces ativos */
  activeWorkspaces(): WorkspaceInfo[] {
    return this.workspaces.filter((w) => w.isActive)
  }

  /** count — Número de workspaces registrados */
  count(): number {
    return this.workspaces.length
  }

  // ─── Persistence ──────────────────────────────────────────────

  private load(): void {
    try {
      if (existsSync(REGISTRY_PATH)) {
        const raw = readFileSync(REGISTRY_PATH, 'utf-8')
        const data = JSON.parse(raw) as { workspaces?: WorkspaceInfo[] }
        this.workspaces = data.workspaces ?? []
      }
    } catch {
      this.workspaces = []
    }
  }

  private save(): void {
    mkdirSync(ATHION_DIR, { recursive: true })
    writeFileSync(REGISTRY_PATH, JSON.stringify({ workspaces: this.workspaces }, null, 2), 'utf-8')
  }
}

function hashPath(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 8)
}
