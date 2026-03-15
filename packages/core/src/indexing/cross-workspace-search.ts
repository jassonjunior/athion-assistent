/**
 * CrossWorkspaceSearch
 * Descrição: Agregador de busca em múltiplos workspaces.
 * Usa Promise.allSettled para tolerância a falhas parciais.
 * Fan-out com timeout por workspace, merge por score.
 */

import { existsSync } from 'node:fs'
import type { WorkspaceRegistry } from './workspace-registry.js'
import type { CodebaseIndexer } from './manager.js'
import { createCodebaseIndexer } from './manager.js'
import type {
  CrossSearchOptions,
  CrossSearchResult,
  WorkspaceSearchResult,
  PartialError,
} from './workspace-types.js'

const DEFAULT_LIMIT = 10
const DEFAULT_TIMEOUT = 5000

/**
 * crossWorkspaceSearch
 * Descrição: Executa busca em múltiplos workspaces e agrega resultados.
 */
export async function crossWorkspaceSearch(
  registry: WorkspaceRegistry,
  options: CrossSearchOptions,
): Promise<CrossSearchResult> {
  const start = Date.now()
  const limit = options.limit ?? DEFAULT_LIMIT
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT

  const workspaces = options.workspaces
    ? registry.list().filter((w) => options.workspaces?.includes(w.id))
    : registry.activeWorkspaces()

  if (workspaces.length === 0) {
    return {
      results: [],
      errors: [],
      stats: { workspacesQueried: 0, workspacesSucceeded: 0, totalDurationMs: 0 },
    }
  }

  const settled = await Promise.allSettled(
    workspaces.map((ws) =>
      searchSingleWorkspace(ws.id, ws.name, ws.path, ws.indexDbPath, options.query, limit, timeout),
    ),
  )

  const results: WorkspaceSearchResult[] = []
  const errors: PartialError[] = []
  let succeeded = 0

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]
    const ws = workspaces[i]
    if (!result || !ws) continue

    if (result.status === 'fulfilled') {
      results.push(...result.value)
      succeeded++
    } else {
      const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason)
      errors.push({
        workspaceId: ws.id,
        workspaceName: ws.name,
        error: errMsg,
        code: errMsg.includes('timeout') ? 'TIMEOUT' : 'DB_ERROR',
      })
    }
  }

  // Sort by score descending (interleave)
  if (options.mergeStrategy === 'interleave') {
    results.sort((a, b) => b.score - a.score)
  }

  return {
    results: results.slice(0, limit),
    errors,
    stats: {
      workspacesQueried: workspaces.length,
      workspacesSucceeded: succeeded,
      totalDurationMs: Date.now() - start,
    },
  }
}

async function searchSingleWorkspace(
  wsId: string,
  wsName: string,
  wsPath: string,
  dbPath: string,
  query: string,
  limit: number,
  timeoutMs: number,
): Promise<WorkspaceSearchResult[]> {
  if (!existsSync(dbPath)) {
    throw new Error(`Index DB not found for workspace ${wsName}`)
  }

  const indexer: CodebaseIndexer = createCodebaseIndexer({
    workspacePath: wsPath,
    dbPath,
  })

  try {
    const searchPromise = indexer.search(query, limit)
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Search timeout for ${wsName}`)), timeoutMs),
    )

    const searchResults = await Promise.race([searchPromise, timeoutPromise])

    return searchResults.map((r) => ({
      workspaceId: wsId,
      workspaceName: wsName,
      file: r.chunk.filePath,
      startLine: r.chunk.startLine,
      ...(r.chunk.symbolName !== undefined ? { symbolName: r.chunk.symbolName } : {}),
      score: r.score,
      content: r.chunk.content,
      source: r.source,
    }))
  } finally {
    await indexer.close()
  }
}
