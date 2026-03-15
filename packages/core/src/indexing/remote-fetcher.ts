/**
 * RemoteFetcher
 * Descrição: Clone, update e cleanup de repositórios remotos.
 * Usa shallow clone + sparse checkout para minimizar download.
 * Repos ficam em ~/.athion/repos/{owner}/{repo}/
 */

import { execSync } from 'node:child_process'
import { existsSync, rmSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { RemoteInfo } from './workspace-types.js'

const REPOS_DIR = join(homedir(), '.athion', 'repos')
const DEFAULT_BRANCH = 'main'
const CLONE_TIMEOUT = 60_000
const CLEANUP_DAYS = 30

/** RemoteRepo — Repositório remoto com metadados */
export interface RemoteRepo {
  url: string
  owner: string
  name: string
  localPath: string
  branch: string
  sparsePatterns?: string[]
  lastSynced: string
}

/**
 * parseRepoUrl — Extrai owner e nome do repositório de uma URL
 */
export function parseRepoUrl(url: string): { owner: string; name: string } {
  const cleaned = url.replace(/\.git$/, '')
  const parts = cleaned.split('/')
  const name = parts.pop() ?? ''
  const owner = parts.pop() ?? ''
  return { owner, name }
}

/**
 * cloneRepo — Faz shallow clone de um repositório remoto
 */
export function cloneRepo(url: string, branch?: string, sparsePatterns?: string[]): RemoteRepo {
  const { owner, name } = parseRepoUrl(url)
  const localPath = join(REPOS_DIR, owner, name)
  const targetBranch = branch ?? DEFAULT_BRANCH

  if (existsSync(localPath)) {
    syncRepo(localPath)
    return {
      url,
      owner,
      name,
      localPath,
      branch: targetBranch,
      ...(sparsePatterns !== undefined ? { sparsePatterns } : {}),
      lastSynced: new Date().toISOString(),
    }
  }

  const sparseFlag = sparsePatterns?.length ? '--sparse' : ''
  const cmd = `git clone --depth=1 --branch ${targetBranch} ${sparseFlag} ${url} ${localPath}`
  execSync(cmd, { timeout: CLONE_TIMEOUT, stdio: 'pipe' })

  if (sparsePatterns?.length) {
    for (const pattern of sparsePatterns) {
      execSync(`git sparse-checkout add ${pattern}`, {
        cwd: localPath,
        timeout: 10_000,
        stdio: 'pipe',
      })
    }
  }

  return {
    url,
    owner,
    name,
    localPath,
    branch: targetBranch,
    ...(sparsePatterns !== undefined ? { sparsePatterns } : {}),
    lastSynced: new Date().toISOString(),
  }
}

/**
 * syncRepo — Atualiza um repositório já clonado
 */
export function syncRepo(localPath: string): void {
  if (!existsSync(localPath)) {
    throw new Error(`Repository not found at ${localPath}`)
  }
  execSync('git pull --depth=1', {
    cwd: localPath,
    timeout: CLONE_TIMEOUT,
    stdio: 'pipe',
  })
}

/**
 * removeRepo — Remove repositório local
 */
export function removeRepo(localPath: string): void {
  if (existsSync(localPath)) {
    rmSync(localPath, { recursive: true, force: true })
  }
}

/**
 * toRemoteInfo — Converte RemoteRepo em RemoteInfo para WorkspaceRegistry
 */
export function toRemoteInfo(repo: RemoteRepo): RemoteInfo {
  return {
    url: repo.url,
    branch: repo.branch,
    ...(repo.sparsePatterns !== undefined ? { sparsePatterns: repo.sparsePatterns } : {}),
    lastSynced: repo.lastSynced,
  }
}

/**
 * cleanupStaleRepos — Remove repos não acessados em X dias
 */
export function cleanupStaleRepos(maxAgeDays: number = CLEANUP_DAYS): string[] {
  const removed: string[] = []
  if (!existsSync(REPOS_DIR)) return removed

  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000

  for (const ownerDir of safeReaddir(REPOS_DIR)) {
    const ownerPath = join(REPOS_DIR, ownerDir)
    if (!isDirectory(ownerPath)) continue

    for (const repoDir of safeReaddir(ownerPath)) {
      const repoPath = join(ownerPath, repoDir)
      if (!isDirectory(repoPath)) continue

      try {
        const stat = statSync(repoPath)
        if (stat.mtimeMs < cutoff) {
          rmSync(repoPath, { recursive: true, force: true })
          removed.push(`${ownerDir}/${repoDir}`)
        }
      } catch {
        // Skip inaccessible directories
      }
    }
  }

  return removed
}

/**
 * listRepos — Lista todos os repos clonados localmente
 */
export function listRepos(): Array<{ owner: string; name: string; localPath: string }> {
  const repos: Array<{ owner: string; name: string; localPath: string }> = []
  if (!existsSync(REPOS_DIR)) return repos

  for (const ownerDir of safeReaddir(REPOS_DIR)) {
    const ownerPath = join(REPOS_DIR, ownerDir)
    if (!isDirectory(ownerPath)) continue

    for (const repoDir of safeReaddir(ownerPath)) {
      const repoPath = join(ownerPath, repoDir)
      if (!isDirectory(repoPath)) continue
      repos.push({ owner: ownerDir, name: repoDir, localPath: repoPath })
    }
  }

  return repos
}

function safeReaddir(path: string): string[] {
  try {
    return readdirSync(path)
  } catch {
    return []
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}
