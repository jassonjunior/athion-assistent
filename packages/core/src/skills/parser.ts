import { readFile } from 'node:fs/promises'
import { basename, dirname } from 'node:path'
import type { SkillDefinition } from './types'

/** parseSkillFile
 * Descrição: Parseia um arquivo .md de skill. Suporta dois formatos:
 * formato Athion (## Triggers / ## Instructions) e formato Claude Code (YAML frontmatter).
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

/** parseYamlFrontmatter
 * Descrição: Parseia formato Claude Code com YAML frontmatter.
 * Extrai name, description e triggers do frontmatter.
 * @param content - Conteúdo completo do arquivo .md
 * @param filePath - Caminho absoluto do arquivo (usado como fallback para nome)
 * @returns SkillDefinition parseada do frontmatter
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

/** parseAthionFormat
 * Descrição: Parseia formato Athion com seções ## Triggers / ## Instructions.
 * Extrai nome do heading, descrição da primeira linha após o título, triggers
 * da seção ## Triggers e instruções da seção ## Instructions.
 * @param content - Conteúdo completo do arquivo .md
 * @param filePath - Caminho absoluto do arquivo (usado como fallback para nome)
 * @returns SkillDefinition parseada do formato Athion
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

/** extractListSection
 * Descrição: Extrai itens de lista (- item) de uma seção ## do markdown
 * @param lines - Linhas do arquivo
 * @param sectionName - Nome da seção (sem ##)
 * @returns Array com os itens da lista encontrados na seção
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

/** extractContentSection
 * Descrição: Extrai todo o conteúdo de texto de uma seção ## do markdown
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
