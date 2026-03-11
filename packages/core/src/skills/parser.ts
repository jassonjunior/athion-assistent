import { readFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import type { SkillDefinition } from './types'

/**
 * Parseia um arquivo .md de skill.
 * Suporta dois formatos:
 *
 * Formato Athion (## Triggers / ## Instructions):
 * ```markdown
 * # Nome da Skill
 * Descrição.
 * ## Triggers
 * - palavra1
 * ## Instructions
 * Conteúdo...
 * ```
 *
 * Formato Claude Code (YAML frontmatter):
 * ```markdown
 * ---
 * name: skill-name
 * description: Descrição da skill.
 * metadata:
 *   triggers: trigger1, trigger2
 * ---
 * # Conteúdo markdown...
 * ```
 *
 * @param filePath - Caminho absoluto do arquivo .md
 * @returns SkillDefinition parseada do arquivo
 */
export async function parseSkillFile(filePath: string): Promise<SkillDefinition> {
  const content = await readFile(filePath, 'utf-8')

  // Detecta YAML frontmatter (Claude Code SKILL.md format)
  if (content.startsWith('---\n') || content.startsWith('---\r\n')) {
    return parseYamlFrontmatter(content, filePath)
  }

  return parseAthionFormat(content, filePath)
}

/**
 * Parseia formato Claude Code com YAML frontmatter.
 * Extrai name, description e triggers do frontmatter.
 */
function parseYamlFrontmatter(content: string, filePath: string): SkillDefinition {
  const endMarker = content.indexOf('\n---', 4)
  if (endMarker === -1) {
    return parseAthionFormat(content, filePath)
  }

  const frontmatter = content.slice(4, endMarker)
  const body = content.slice(endMarker + 4).trim()

  // Extrai campos do YAML manualmente (sem dependência yaml)
  const nameMatch = frontmatter.match(/^name:\s*['"]?(.+?)['"]?\s*$/m)
  const descMatch = frontmatter.match(/^description:\s*[>|]?\s*\n?([\s\S]*?)(?=\n\w|\n---|\n$|$)/m)

  // triggers pode estar em metadata.triggers ou como campo direto
  const triggersMatch =
    frontmatter.match(/^\s+triggers:\s*(.+)$/m) ?? frontmatter.match(/^triggers:\s*(.+)$/m)

  // Nome: campo name, ou nome do diretório pai (SKILL.md → nome da pasta), ou nome do arquivo
  const dirName = basename(dirname(filePath))
  const name =
    nameMatch?.[1]?.trim() ??
    (basename(filePath) === 'SKILL.md' ? dirName : basename(filePath, '.md'))

  // Descrição: campo description (pode ser multiline com > ou inline)
  let description = ''
  if (descMatch?.[1]) {
    description = descMatch[1]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .join(' ')
      .trim()
  }

  // Triggers: campo triggers (string separada por vírgula)
  const triggers = triggersMatch?.[1]
    ? triggersMatch[1]
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
    : []

  return {
    name,
    description,
    triggers,
    instructions: body || content,
    sourcePath: filePath,
  }
}

/**
 * Parseia formato Athion com seções ## Triggers / ## Instructions.
 */
function parseAthionFormat(content: string, filePath: string): SkillDefinition {
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
