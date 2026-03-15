import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let tempHome: string

// Mock homedir() para isolamento
vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>()
  return {
    ...original,
    homedir: () => tempHome,
  }
})

describe('RemoteFetcher', () => {
  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'athion-remote-test-'))
    mkdirSync(join(tempHome, '.athion', 'repos'), { recursive: true })
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true })
  })

  async function loadModule() {
    return await import('./remote-fetcher.js')
  }

  describe('parseRepoUrl()', () => {
    it('extrai owner e name de URL HTTPS', async () => {
      const { parseRepoUrl } = await loadModule()
      const result = parseRepoUrl('https://github.com/user/repo')
      expect(result.owner).toBe('user')
      expect(result.name).toBe('repo')
    })

    it('remove .git da URL', async () => {
      const { parseRepoUrl } = await loadModule()
      const result = parseRepoUrl('https://github.com/org/project.git')
      expect(result.owner).toBe('org')
      expect(result.name).toBe('project')
    })

    it('retorna string vazia para URL inválida', async () => {
      const { parseRepoUrl } = await loadModule()
      const result = parseRepoUrl('')
      expect(result.name).toBe('')
    })
  })

  describe('toRemoteInfo()', () => {
    it('converte RemoteRepo para RemoteInfo', async () => {
      const { toRemoteInfo } = await loadModule()
      const info = toRemoteInfo({
        url: 'https://github.com/user/repo',
        owner: 'user',
        name: 'repo',
        localPath: '/tmp/repos/user/repo',
        branch: 'main',
        sparsePatterns: ['src/**'],
        lastSynced: '2026-01-01T00:00:00.000Z',
      })
      expect(info.url).toBe('https://github.com/user/repo')
      expect(info.branch).toBe('main')
      expect(info.sparsePatterns).toEqual(['src/**'])
    })

    it('converte sem sparse patterns', async () => {
      const { toRemoteInfo } = await loadModule()
      const info = toRemoteInfo({
        url: 'https://github.com/user/repo',
        owner: 'user',
        name: 'repo',
        localPath: '/tmp/repos/user/repo',
        branch: 'develop',
        lastSynced: '2026-01-01T00:00:00.000Z',
      })
      expect(info.sparsePatterns).toBeUndefined()
    })
  })

  describe('listRepos()', () => {
    it('retorna array vazio quando não há repos', async () => {
      const { listRepos } = await loadModule()
      const repos = listRepos()
      expect(repos).toEqual([])
    })

    it('lista repos existentes', async () => {
      const reposDir = join(tempHome, '.athion', 'repos')
      mkdirSync(join(reposDir, 'owner1', 'repo1'), { recursive: true })
      mkdirSync(join(reposDir, 'owner1', 'repo2'), { recursive: true })
      mkdirSync(join(reposDir, 'owner2', 'repo3'), { recursive: true })

      const { listRepos } = await loadModule()
      const repos = listRepos()
      expect(repos).toHaveLength(3)
      expect(
        repos.map((r: { owner: string; name: string }) => `${r.owner}/${r.name}`).sort(),
      ).toEqual(['owner1/repo1', 'owner1/repo2', 'owner2/repo3'])
    })
  })

  describe('cleanupStaleRepos()', () => {
    it('retorna vazio quando não há repos', async () => {
      const { cleanupStaleRepos } = await loadModule()
      const removed = cleanupStaleRepos(0)
      expect(removed).toEqual([])
    })

    it('remove repos com mtime mais antigo que maxAgeDays', async () => {
      const reposDir = join(tempHome, '.athion', 'repos')
      mkdirSync(join(reposDir, 'old-owner', 'old-repo'), { recursive: true })

      const { cleanupStaleRepos } = await loadModule()
      const removed = cleanupStaleRepos(0)
      expect(removed).toHaveLength(1)
      expect(removed[0]).toBe('old-owner/old-repo')
    })

    it('mantém repos recentes', async () => {
      const reposDir = join(tempHome, '.athion', 'repos')
      mkdirSync(join(reposDir, 'recent-owner', 'recent-repo'), { recursive: true })

      const { cleanupStaleRepos } = await loadModule()
      const removed = cleanupStaleRepos(365)
      expect(removed).toHaveLength(0)
    })
  })
})
