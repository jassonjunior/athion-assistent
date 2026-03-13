/**
 * Skill Registry — busca e instalação de skills.
 *
 * Fontes de skills:
 * 1. Catálogo embutido (registry-data.ts) — fallback offline
 * 2. GitHub repos — busca em repos conhecidos via API
 *
 * Instalação: baixa SKILL.md + arquivos auxiliares para ~/.athion/skills/<name>/
 */

import { existsSync } from 'node:fs'
import { writeFile, unlink, mkdir, rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SkillManager, SkillRegistry, SkillSearchResult } from './types'
import { registryData } from './registry-data'

/** Repos GitHub conhecidos para busca de skills. */
const KNOWN_REPOS = [
  'anthropics/skills',
  'daymade/claude-code-skills',
  'alirezarezvani/claude-skills',
  'VoltAgent/awesome-agent-skills',
]

/** Cache de skills encontradas no GitHub (evita chamadas repetidas). */
interface GitHubSkillCache {
  skills: Map<string, GitHubSkillInfo>
  lastFetch: number
}

interface GitHubSkillInfo {
  name: string
  description: string
  repo: string
  path: string
  hasSkillMd: boolean
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutos
const cache: GitHubSkillCache = { skills: new Map(), lastFetch: 0 }

export function createSkillRegistry(skillManager: SkillManager): SkillRegistry {
  const skillsDir = join(homedir(), '.athion', 'skills')

  // ── Busca local (catálogo embutido) ──────────────────────────────

  function search(query?: string) {
    if (!query) return registryData.skills
    const lower = query.toLowerCase()
    return registryData.skills.filter(
      (entry) =>
        entry.name.includes(lower) ||
        entry.description.toLowerCase().includes(lower) ||
        entry.tags.some((t) => t.includes(lower)) ||
        entry.triggers.some((t) => t.toLowerCase().includes(lower)),
    )
  }

  function listAvailable() {
    return registryData.skills
  }

  function isInstalled(name: string) {
    return skillManager.get(name) !== undefined
  }

  // ── Busca GitHub ─────────────────────────────────────────────────

  async function searchGitHub(query: string): Promise<SkillSearchResult[]> {
    const lower = query.toLowerCase()
    const results: SkillSearchResult[] = []

    // 1. Busca no catálogo local primeiro
    const localMatches = search(query)
    for (const entry of localMatches) {
      results.push({
        name: entry.name,
        description: entry.description,
        source: 'bundled',
        installed: isInstalled(entry.name),
      })
    }

    // 2. Busca nos repos GitHub conhecidos
    await refreshCacheIfNeeded()

    for (const [, info] of cache.skills) {
      if (results.some((r) => r.name === info.name)) continue // já incluído do local
      if (info.name.includes(lower) || info.description.toLowerCase().includes(lower)) {
        results.push({
          name: info.name,
          description: info.description,
          source: 'github',
          installed: isInstalled(info.name),
          repo: info.repo,
        })
      }
    }

    return results
  }

  async function refreshCacheIfNeeded(): Promise<void> {
    if (Date.now() - cache.lastFetch < CACHE_TTL_MS && cache.skills.size > 0) return

    const fetchPromises = KNOWN_REPOS.map((repo) => fetchRepoSkills(repo))
    const allResults = await Promise.allSettled(fetchPromises)

    for (const result of allResults) {
      if (result.status === 'fulfilled') {
        for (const skill of result.value) {
          cache.skills.set(`${skill.repo}/${skill.name}`, skill)
        }
      }
    }
    cache.lastFetch = Date.now()
  }

  async function fetchRepoSkills(repo: string): Promise<GitHubSkillInfo[]> {
    const skills: GitHubSkillInfo[] = []
    try {
      // Tenta buscar no diretório 'skills/' primeiro (anthropics/skills)
      let items = await ghApiContents(repo, 'skills')
      if (!items || items.length === 0) {
        // Fallback: listar raiz do repo (daymade/claude-code-skills)
        items = await ghApiContents(repo, '')
      }

      for (const item of items) {
        if (item.type !== 'dir') continue
        // Ignora diretórios internos comuns
        if (
          item.name.startsWith('.') ||
          ['spec', 'template', 'scripts', 'demos', 'docs'].includes(item.name)
        )
          continue

        skills.push({
          name: item.name,
          description: '',
          repo,
          path: item.path,
          hasSkillMd: true,
        })
      }

      // Tenta buscar descrições dos SKILL.md (batch limitado para não bater rate limit)
      const batch = skills.slice(0, 20)
      const descPromises = batch.map(async (s) => {
        try {
          const desc = await fetchSkillDescription(repo, s.path)
          if (desc) s.description = desc
        } catch {
          // ignore — fica sem descrição
        }
      })
      await Promise.allSettled(descPromises)
    } catch {
      // repo inacessível — silencia
    }
    return skills
  }

  async function fetchSkillDescription(repo: string, path: string): Promise<string> {
    const content = await ghApiFileContent(repo, `${path}/SKILL.md`)
    if (!content) return ''

    // Extrai description do frontmatter
    if (content.startsWith('---')) {
      const endIdx = content.indexOf('\n---', 4)
      if (endIdx !== -1) {
        const frontmatter = content.slice(4, endIdx)
        const descMatch = frontmatter.match(/^description:\s*["']?(.+?)["']?\s*$/m)
        if (descMatch?.[1]) return descMatch[1].slice(0, 120)
      }
    }

    // Fallback: primeira linha não-vazia após #
    const lines = content.split('\n')
    let foundTitle = false
    for (const line of lines) {
      if (line.startsWith('# ')) {
        foundTitle = true
        continue
      }
      if (foundTitle && line.trim() && !line.startsWith('#')) {
        return line.trim().slice(0, 120)
      }
    }
    return ''
  }

  // ── GitHub API helpers ───────────────────────────────────────────

  async function ghApiContents(
    repo: string,
    path: string,
  ): Promise<Array<{ name: string; type: string; path: string }>> {
    const url = path
      ? `https://api.github.com/repos/${repo}/contents/${path}`
      : `https://api.github.com/repos/${repo}/contents`
    const res = await fetch(url, {
      headers: ghHeaders(),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const data = await res.json()
    if (!Array.isArray(data)) return []
    return data as Array<{ name: string; type: string; path: string }>
  }

  async function ghApiFileContent(repo: string, path: string): Promise<string | null> {
    const url = `https://api.github.com/repos/${repo}/contents/${path}`
    const res = await fetch(url, {
      headers: ghHeaders(),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { content?: string; encoding?: string }
    if (data.content && data.encoding === 'base64') {
      return Buffer.from(data.content, 'base64').toString('utf-8')
    }
    return null
  }

  function ghHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'athion-skill-registry',
    }
    // Usa token do GitHub se disponível (aumenta rate limit de 60→5000/h)
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN
    if (token) headers.Authorization = `Bearer ${token}`
    return headers
  }

  // ── Instalação ───────────────────────────────────────────────────

  async function install(nameOrPath: string): Promise<{ success: boolean; error?: string }> {
    // Formato: owner/repo/skill-name
    const parts = nameOrPath.split('/')
    if (parts.length >= 3) {
      return installFromRepo(parts[0], parts[1], parts.slice(2).join('/'))
    }

    // Formato: owner/repo (instala todas? não — precisa de nome)
    if (parts.length === 2) {
      // Tenta como repo/skill-name nos repos conhecidos
      return installFromKnownRepos(nameOrPath)
    }

    // Nome simples — busca primeiro no catálogo local, depois no GitHub
    const name = parts[0]

    // 1. Tenta catálogo local
    const localEntry = registryData.skills.find((s) => s.name === name)
    if (localEntry) {
      return installLocal(localEntry)
    }

    // 2. Tenta encontrar no GitHub
    await refreshCacheIfNeeded()
    for (const [, info] of cache.skills) {
      if (info.name === name) {
        const [owner, repo] = info.repo.split('/')
        return installFromRepo(owner, repo, info.path)
      }
    }

    return {
      success: false,
      error: `Skill '${name}' não encontrada. Use /find-skills para buscar.`,
    }
  }

  async function installLocal(entry: {
    name: string
    content?: string
    url?: string
  }): Promise<{ success: boolean; error?: string }> {
    if (isInstalled(entry.name)) {
      return { success: false, error: `Skill '${entry.name}' já está instalada.` }
    }
    const destDir = join(skillsDir, entry.name)
    await mkdir(destDir, { recursive: true })

    if (entry.content) {
      await writeFile(join(destDir, 'SKILL.md'), entry.content, 'utf-8')
    } else if (entry.url) {
      const res = await fetch(entry.url)
      if (!res.ok) return { success: false, error: `Falha ao baixar: HTTP ${res.status}` }
      await writeFile(join(destDir, 'SKILL.md'), await res.text(), 'utf-8')
    } else {
      return { success: false, error: `Skill '${entry.name}' não tem conteúdo nem URL.` }
    }

    await skillManager.loadFromDirectory(skillsDir)
    return { success: true }
  }

  async function installFromRepo(
    owner: string,
    repo: string,
    skillPath: string,
  ): Promise<{ success: boolean; error?: string }> {
    const fullRepo = `${owner}/${repo}`
    const skillName = skillPath.split('/').pop() ?? skillPath

    if (isInstalled(skillName)) {
      return { success: false, error: `Skill '${skillName}' já está instalada.` }
    }

    try {
      // Lista arquivos da skill no repo
      const items = await ghApiContents(fullRepo, skillPath)
      if (!items || items.length === 0) {
        // Tenta com prefixo 'skills/'
        const altItems = await ghApiContents(fullRepo, `skills/${skillPath}`)
        if (!altItems || altItems.length === 0) {
          return { success: false, error: `Skill '${skillPath}' não encontrada em ${fullRepo}.` }
        }
        return downloadSkillFiles(fullRepo, `skills/${skillPath}`, skillName, altItems)
      }
      return downloadSkillFiles(fullRepo, skillPath, skillName, items)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: `Erro ao instalar de ${fullRepo}: ${msg}` }
    }
  }

  async function installFromKnownRepos(
    query: string,
  ): Promise<{ success: boolean; error?: string }> {
    // Busca em todos os repos conhecidos
    await refreshCacheIfNeeded()
    for (const [, info] of cache.skills) {
      if (info.name === query || `${info.repo}/${info.name}` === query) {
        const [owner, repo] = info.repo.split('/')
        return installFromRepo(owner, repo, info.path)
      }
    }
    return { success: false, error: `Skill '${query}' não encontrada nos repos conhecidos.` }
  }

  async function downloadSkillFiles(
    repo: string,
    path: string,
    skillName: string,
    items: Array<{ name: string; type: string; path: string }>,
  ): Promise<{ success: boolean; error?: string }> {
    const destDir = join(skillsDir, skillName)
    await mkdir(destDir, { recursive: true })

    let downloadedAny = false
    for (const item of items) {
      if (item.type === 'file') {
        const content = await ghApiFileContent(repo, item.path)
        if (content) {
          await writeFile(join(destDir, item.name), content, 'utf-8')
          downloadedAny = true
        }
      } else if (item.type === 'dir') {
        // Baixa subdiretórios recursivamente (1 nível)
        await downloadSubdir(repo, item.path, join(destDir, item.name))
      }
    }

    if (!downloadedAny) {
      await rm(destDir, { recursive: true, force: true })
      return { success: false, error: `Nenhum arquivo encontrado em ${repo}/${path}.` }
    }

    await skillManager.loadFromDirectory(skillsDir)
    return { success: true }
  }

  async function downloadSubdir(repo: string, path: string, destDir: string): Promise<void> {
    const items = await ghApiContents(repo, path)
    if (!items || items.length === 0) return
    await mkdir(destDir, { recursive: true })
    for (const item of items) {
      if (item.type === 'file') {
        const content = await ghApiFileContent(repo, item.path)
        if (content) {
          await writeFile(join(destDir, item.name), content, 'utf-8')
        }
      }
    }
  }

  // ── Desinstalação ────────────────────────────────────────────────

  async function uninstall(name: string) {
    // Tenta como diretório primeiro (novo formato)
    const dirPath = join(skillsDir, name)
    if (existsSync(dirPath)) {
      const stat = await import('node:fs/promises').then((m) => m.stat(dirPath))
      if (stat.isDirectory()) {
        await rm(dirPath, { recursive: true, force: true })
        skillManager.unregister(name)
        return { success: true }
      }
    }
    // Fallback: arquivo .md solto (formato antigo)
    const filePath = join(skillsDir, `${name}.md`)
    if (!existsSync(filePath)) {
      return { success: false, error: `Skill '${name}' não encontrada em disco.` }
    }
    await unlink(filePath)
    skillManager.unregister(name)
    return { success: true }
  }

  return { search, searchGitHub, listAvailable, install, uninstall, isInstalled }
}
