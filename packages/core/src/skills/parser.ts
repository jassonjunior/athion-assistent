import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { SkillDefinition } from './types'

/**
 * Parseia um arquivo .md de skill e extrai os metadados.
 * O formato esperado é:
 *
 * ```markdown
 * # Nome da Skill
 *
 * Descrição da skill em uma linha.
 *
 * ## Triggers
 * - palavra1
 * - palavra2
 *
 * ## Instructions
 * Conteúdo das instruções...
 * ```
 *
 * Se as seções não forem encontradas, usa valores padrão.
 * @param filePath - Caminho absoluto do arquivo .md
 * @returns SkillDefinition parseada do arquivo
 */
export async function parseSkillFile(filePath: string): Promise<SkillDefinition> {
  const content = await readFile(filePath, 'utf-8')
  const lines = content.split('\n')

  // Nome: do heading # ou do nome do arquivo
  const titleLine = lines.find((line) => line.startsWith('# '))
  const name = titleLine
    ? titleLine.replace('# ', '').trim().toLowerCase().replace(/\s+/g, '-')
    : basename(filePath, '.md')

  // Descrição: primeira linha não-vazia após o título
  const titleIndex = lines.findIndex((line) => line.startsWith('# '))
  let description = ''
  if (titleIndex !== -1) {
    for (let i = titleIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line && !line.startsWith('#')) {
        description = line
        break
      }
    }
  }

  // Triggers: lista de itens na seção ## Triggers
  const triggers = extractListSection(lines, 'Triggers')

  // Instructions: tudo após ## Instructions
  const instructions = extractContentSection(lines, 'Instructions')

  return {
    name,
    description,
    triggers,
    instructions: instructions || content,
    sourcePath: filePath,
  }
}

/**
 * Extrai itens de lista (- item) de uma seção ## do markdown.
 * @param lines - Linhas do arquivo
 * @param sectionName - Nome da seção (sem ##)
 * @returns Array com os itens da lista
 */
function extractListSection(lines: string[], sectionName: string): string[] {
  const items: string[] = []
  let inSection = false

  for (const line of lines) {
    if (line.match(new RegExp(`^##\\s+${sectionName}`, 'i'))) {
      inSection = true
      continue
    }
    if (inSection && line.startsWith('## ')) {
      break
    }
    if (inSection && line.trim().startsWith('- ')) {
      items.push(line.trim().replace(/^-\s+/, ''))
    }
  }

  return items
}

/**
 * Extrai todo o conteúdo de texto de uma seção ## do markdown.
 * @param lines - Linhas do arquivo
 * @param sectionName - Nome da seção (sem ##)
 * @returns Conteúdo da seção como string
 */
function extractContentSection(lines: string[], sectionName: string): string {
  const contentLines: string[] = []
  let inSection = false

  for (const line of lines) {
    if (line.match(new RegExp(`^##\\s+${sectionName}`, 'i'))) {
      inSection = true
      continue
    }
    if (inSection && line.startsWith('## ')) {
      break
    }
    if (inSection) {
      contentLines.push(line)
    }
  }

  return contentLines.join('\n').trim()
}
