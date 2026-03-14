/** ContextFormatters
 * Descrição: Formatadores de contexto hierárquico para o prompt do agente.
 * Cada nível do índice (L0-L4) tem um formatador que transforma dados
 * do banco em texto estruturado para inclusão no prompt.
 * Ordem: L0 (repo) → L4 (patterns) → Impact → L2 (files) → L3 (symbols) → Task
 */

import type { ImpactResult } from './dependency-graph'

/** RepoMetaData
 * Descrição: Dados L0 do repositório para formatação
 */
export interface RepoMetaData {
  language?: string
  framework?: string
  testFramework?: string
  entryPoints?: string[]
  buildSystem?: string
  architectureStyle?: string
  databaseTech?: string
  packageManager?: string
}

/** PatternData
 * Descrição: Dados L4 de padrões do codebase para formatação
 */
export interface PatternData {
  namingFunctions?: string
  namingClasses?: string
  namingConstants?: string
  namingFiles?: string
  namingVariables?: string
  errorHandling?: string
  importStyle?: string
  testingPatterns?: string
  architecturePatterns?: string
  antiPatterns?: string
}

/** FileSummaryData
 * Descrição: Dados L2 de um arquivo para formatação
 */
export interface FileSummaryData {
  filePath: string
  purpose: string
  exports: string[]
}

/** SymbolData
 * Descrição: Dados L3 de um símbolo para formatação
 */
export interface SymbolData {
  filePath: string
  symbolName: string
  chunkType: string
  startLine: number
  endLine: number
  content: string
}

/** ImpactData
 * Descrição: Dados de impact analysis para formatação
 */
export interface ImpactData {
  filePath: string
  impact: ImpactResult
}

/** formatRepoMeta
 * Descrição: Formata metadata L0 do repositório para o prompt
 * @param meta - Dados do repositório
 * @returns Texto formatado com identidade do repo
 */
export function formatRepoMeta(meta: RepoMetaData): string {
  const lines: string[] = ['## Repositório']

  if (meta.language) lines.push(`- **Linguagem**: ${meta.language}`)
  if (meta.framework) lines.push(`- **Framework**: ${meta.framework}`)
  if (meta.testFramework) lines.push(`- **Testes**: ${meta.testFramework}`)
  if (meta.buildSystem) lines.push(`- **Build**: ${meta.buildSystem}`)
  if (meta.architectureStyle) lines.push(`- **Arquitetura**: ${meta.architectureStyle}`)
  if (meta.databaseTech) lines.push(`- **Banco**: ${meta.databaseTech}`)
  if (meta.packageManager) lines.push(`- **Package Manager**: ${meta.packageManager}`)
  if (meta.entryPoints && meta.entryPoints.length > 0) {
    lines.push(`- **Entry Points**: ${meta.entryPoints.join(', ')}`)
  }

  return lines.join('\n')
}

/** formatPatterns
 * Descrição: Formata padrões L4 do codebase para o prompt.
 * Anti-patterns são listados como "NUNCA faça".
 * @param patterns - Dados de padrões
 * @returns Texto formatado com convenções obrigatórias
 */
export function formatPatterns(patterns: PatternData): string {
  const lines: string[] = ['## Convenções do Codebase (OBRIGATÓRIO)']

  if (patterns.namingFunctions) lines.push(`- **Funções**: ${patterns.namingFunctions}`)
  if (patterns.namingClasses) lines.push(`- **Classes**: ${patterns.namingClasses}`)
  if (patterns.namingConstants) lines.push(`- **Constantes**: ${patterns.namingConstants}`)
  if (patterns.namingFiles) lines.push(`- **Arquivos**: ${patterns.namingFiles}`)
  if (patterns.namingVariables) lines.push(`- **Variáveis**: ${patterns.namingVariables}`)
  if (patterns.errorHandling) lines.push(`- **Error Handling**: ${patterns.errorHandling}`)
  if (patterns.importStyle) lines.push(`- **Imports**: ${patterns.importStyle}`)
  if (patterns.testingPatterns) lines.push(`- **Testes**: ${patterns.testingPatterns}`)
  if (patterns.architecturePatterns)
    lines.push(`- **Arquitetura**: ${patterns.architecturePatterns}`)

  if (patterns.antiPatterns) {
    lines.push('')
    lines.push('### NUNCA faça')
    lines.push(patterns.antiPatterns)
  }

  return lines.join('\n')
}

/** formatFileSummaries
 * Descrição: Formata sumários L2 de arquivos relevantes para o prompt
 * @param files - Array de sumários de arquivo
 * @returns Texto formatado com arquivos e seus propósitos
 */
export function formatFileSummaries(files: FileSummaryData[]): string {
  if (files.length === 0) return ''

  const lines: string[] = ['## Arquivos Relevantes']

  for (const file of files) {
    lines.push(`### ${file.filePath}`)
    lines.push(`- **Propósito**: ${file.purpose}`)
    if (file.exports.length > 0) {
      lines.push(`- **Exports**: ${file.exports.join(', ')}`)
    }
  }

  return lines.join('\n')
}

/** formatSymbols
 * Descrição: Formata símbolos L3 agrupados por arquivo para o prompt
 * @param symbols - Array de dados de símbolos
 * @returns Texto formatado com símbolos e code preview
 */
export function formatSymbols(symbols: SymbolData[]): string {
  if (symbols.length === 0) return ''

  // Agrupa por arquivo
  const byFile = new Map<string, SymbolData[]>()
  for (const sym of symbols) {
    if (!byFile.has(sym.filePath)) byFile.set(sym.filePath, [])
    byFile.get(sym.filePath)?.push(sym)
  }

  const lines: string[] = ['## Símbolos Relevantes']

  for (const [filePath, fileSymbols] of byFile) {
    lines.push(`### ${filePath}`)
    for (const sym of fileSymbols) {
      const preview = sym.content.split('\n').slice(0, 5).join('\n')
      lines.push(`- **${sym.symbolName}** (${sym.chunkType}, L${sym.startLine}-${sym.endLine})`)
      lines.push('```')
      lines.push(preview)
      lines.push('```')
    }
  }

  return lines.join('\n')
}

/** formatImpactAnalysis
 * Descrição: Formata resultado de impact analysis para o prompt
 * @param impacts - Array de análises de impacto por arquivo
 * @returns Texto formatado com dependentes e nível de risco
 */
export function formatImpactAnalysis(impacts: ImpactData[]): string {
  if (impacts.length === 0) return ''

  const lines: string[] = ['## Análise de Impacto']

  for (const { filePath, impact } of impacts) {
    const riskEmoji =
      impact.riskLevel === 'high' ? 'ALTO' : impact.riskLevel === 'medium' ? 'MEDIO' : 'BAIXO'

    lines.push(`### ${filePath} [Risco: ${riskEmoji}]`)

    if (impact.directDependents.length > 0) {
      lines.push(`- **Dependentes diretos**: ${impact.directDependents.join(', ')}`)
    }
    lines.push(`- **Dependentes transitivos**: ${impact.transitiveDependents.length} arquivo(s)`)
  }

  return lines.join('\n')
}

/** formatHierarchicalPrompt
 * Descrição: Monta o prompt hierárquico completo na ordem L0→L4→Impact→L2→L3→Task.
 * Cada seção é incluída apenas se tiver conteúdo.
 * @param sections - Seções formatadas do prompt
 * @returns Prompt completo montado
 */
export function formatHierarchicalPrompt(sections: {
  repoMeta?: string
  patterns?: string
  impactAnalysis?: string
  fileSummaries?: string
  symbols?: string
  task?: string
}): string {
  const parts: string[] = []

  // Ordem: L0 → L4 → Impact → L2 → L3 → Task
  if (sections.repoMeta) parts.push(sections.repoMeta)
  if (sections.patterns) parts.push(sections.patterns)
  if (sections.impactAnalysis) parts.push(sections.impactAnalysis)
  if (sections.fileSummaries) parts.push(sections.fileSummaries)
  if (sections.symbols) parts.push(sections.symbols)

  if (sections.task) {
    parts.push('---')
    parts.push(sections.task)
    parts.push('')
    parts.push('> Siga EXATAMENTE as convenções listadas acima.')
  }

  return parts.join('\n\n')
}
