/**
 * Skill Registry — busca e instalação de skills a partir de um catálogo embutido.
 *
 * Substitui o PluginInstaller (npm-based) por um sistema de arquivos .md:
 * - search() busca no catálogo por nome, descrição, tags ou triggers
 * - install() grava o .md em ~/.athion/skills/ e recarrega o SkillManager
 * - uninstall() remove o arquivo e desregistra a skill
 */

import { existsSync } from 'node:fs'
import { writeFile, unlink, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { SkillManager, SkillRegistry } from './types'
import { registryData } from './registry-data'

export function createSkillRegistry(skillManager: SkillManager): SkillRegistry {
  const skillsDir = join(homedir(), '.athion', 'skills')

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

  async function install(name: string) {
    const entry = registryData.skills.find((s) => s.name === name)
    if (!entry) return { success: false, error: `Skill '${name}' não encontrada no registry.` }
    if (isInstalled(name)) return { success: false, error: `Skill '${name}' já está instalada.` }

    await mkdir(skillsDir, { recursive: true })
    const filePath = join(skillsDir, `${name}.md`)

    if (entry.content) {
      await writeFile(filePath, entry.content, 'utf-8')
    } else if (entry.url) {
      const response = await fetch(entry.url)
      if (!response.ok) return { success: false, error: `Falha ao baixar: HTTP ${response.status}` }
      await writeFile(filePath, await response.text(), 'utf-8')
    } else {
      return { success: false, error: `Skill '${name}' não tem conteúdo nem URL.` }
    }

    await skillManager.loadFromDirectory(skillsDir)
    return { success: true }
  }

  async function uninstall(name: string) {
    const filePath = join(skillsDir, `${name}.md`)
    if (!existsSync(filePath))
      return { success: false, error: `Skill '${name}' não encontrada em disco.` }
    await unlink(filePath)
    skillManager.unregister(name)
    return { success: true }
  }

  return { search, listAvailable, install, uninstall, isInstalled }
}
