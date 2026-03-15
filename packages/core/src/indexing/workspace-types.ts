/**
 * workspace-types
 * Descrição: Tipos para o sistema de multi-workspace.
 */

/** WorkspaceInfo — Informações de um workspace registrado */
export interface WorkspaceInfo {
  id: string
  path: string
  name: string
  indexDbPath: string
  lastIndexed: string
  isActive: boolean
  remote?: RemoteInfo
}

/** RemoteInfo — Informações de um repositório remoto */
export interface RemoteInfo {
  url: string
  branch: string
  sparsePatterns?: string[]
  lastSynced: string
}

/** CrossSearchOptions — Opções para busca cross-workspace */
export interface CrossSearchOptions {
  query: string
  limit?: number
  workspaces?: string[]
  mergeStrategy: 'interleave' | 'per-workspace'
  timeoutMs?: number
}

/** CrossSearchResult — Resultado da busca cross-workspace */
export interface CrossSearchResult {
  results: Array<WorkspaceSearchResult>
  errors: PartialError[]
  stats: {
    workspacesQueried: number
    workspacesSucceeded: number
    totalDurationMs: number
  }
}

/** WorkspaceSearchResult — Resultado de busca com contexto de workspace */
export interface WorkspaceSearchResult {
  workspaceId: string
  workspaceName: string
  file: string
  startLine: number
  symbolName?: string
  score: number
  content: string
  source: 'vector' | 'fts' | 'hybrid'
}

/** PartialError — Erro parcial de um workspace na busca */
export interface PartialError {
  workspaceId: string
  workspaceName: string
  error: string
  code: 'TIMEOUT' | 'DB_ERROR' | 'NOT_FOUND'
}
