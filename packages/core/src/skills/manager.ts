import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseSkillFile } from './parser'
import type { SkillDefinition, SkillManager } from './types'

/**
 * Cria uma instância do Skill Manager.
 * Centraliza discovery, registro e busca de skills.
 * Skills podem ser carregadas de diretórios (.md) ou registradas programaticamente.
 * @returns Instância do SkillManager pronta para uso
 * @example
 * const sm = createSkillManager()
 * await sm.loadFromDirectory('~/.athion/skills')
 * const skill = sm.get('commit')
 * const matches = sm.findByTrigger('faça o commit')
 */
export function createSkillManager(): SkillManager {
  const skills = new Map<string, SkillDefinition>()

  /**
   * Carrega skills de um diretório (busca arquivos .md recursivamente).
   * Cada arquivo .md é parseado para extrair metadados da skill.
   * @param dirPath - Caminho do diretório a escanear
   * @returns Número de skills carregadas
   */
  async function loadFromDirectory(dirPath: string): Promise<number> {
    const resolvedPath = resolve(dirPath)
    let loaded = 0

    try {
      const entries = await readdir(resolvedPath, { withFileTypes: true, recursive: true })

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue

        const filePath = join(entry.parentPath ?? resolvedPath, entry.name)
        try {
          const skill = await parseSkillFile(filePath)
          if (!skills.has(skill.name)) {
            skills.set(skill.name, skill)
            loaded++
          }
        } catch {
          // Ignora arquivos que não podem ser parseados
        }
      }
    } catch {
      // Diretório não existe — retorna 0
    }

    return loaded
  }

  /**
   * Registra uma skill programaticamente.
   * @param skill - Definição completa da skill
   * @throws Se já existir uma skill com o mesmo nome
   */
  function register(skill: SkillDefinition): void {
    if (skills.has(skill.name)) {
      throw new Error(`Skill '${skill.name}' is already registered`)
    }
    skills.set(skill.name, skill)
  }

  /**
   * Remove uma skill pelo nome.
   * @param name - Nome da skill a remover
   */
  function unregister(name: string): void {
    skills.delete(name)
  }

  /**
   * Busca uma skill pelo nome exato.
   * @param name - Nome da skill
   * @returns A definição da skill ou undefined
   */
  function get(name: string): SkillDefinition | undefined {
    return skills.get(name)
  }

  /**
   * Busca skills que batem com um trigger.
   * Útil para ativação automática baseada no input do usuário.
   * @param input - Texto do usuário para testar contra triggers
   * @returns Array de skills que batem com o input
   */
  function findByTrigger(input: string): SkillDefinition[] {
    const lowerInput = input.toLowerCase()
    return Array.from(skills.values()).filter((skill) =>
      skill.triggers.some((trigger) => lowerInput.includes(trigger.toLowerCase())),
    )
  }

  /**
   * Lista todas as skills registradas.
   * @returns Array com todas as definições de skills
   */
  function list(): SkillDefinition[] {
    return Array.from(skills.values())
  }

  return { loadFromDirectory, register, unregister, get, findByTrigger, list }
}
