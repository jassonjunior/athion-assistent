/** ProviderEnricher
 * Descrição: Implementação do LlmEnricherPort que usa o ProviderLayer.generateText()
 * para gerar metadados semânticos via LLM. Cada método tem prompt específico
 * pedindo JSON. Tratamento de JSON malformado via Result<T,E>.
 */

import type { ProviderLayer } from '../../provider/provider'
import { Ok, Err } from '../result'
import type { Result } from '../result'
import type {
  LlmEnricherPort,
  EnrichmentError,
  RepoMeta,
  FileSummary,
  ModuleSummary,
  PatternAnalysis,
} from '../ports/llm-enricher.port'

/** ProviderEnricher
 * Descrição: Adapter que implementa LlmEnricherPort usando ProviderLayer.generateText().
 * Zero dependências novas — reutiliza o provider existente do Athion.
 */
export class ProviderEnricher implements LlmEnricherPort {
  constructor(
    private provider: ProviderLayer,
    private providerName: string,
    private modelName: string,
  ) {}

  /** isAvailable
   * Descrição: Verifica se o provider tem modelos disponíveis
   */
  async isAvailable(): Promise<boolean> {
    try {
      const models = this.provider.listModels(this.providerName)
      return models.length > 0
    } catch {
      return false
    }
  }

  /** generateRepoMeta
   * Descrição: Gera metadata L0 do repositório via LLM
   */
  async generateRepoMeta(
    files: string[],
    packageJson?: string,
  ): Promise<Result<RepoMeta, EnrichmentError>> {
    const prompt = `Analyze this codebase and return a JSON object with the following fields:
- language: primary programming language
- framework: main framework (e.g., "React", "Express", "none")
- testFramework: testing framework (e.g., "vitest", "jest", "none")
- entryPoints: array of main entry point files
- buildSystem: build system (e.g., "bun", "webpack", "vite", "none")
- architectureStyle: architecture pattern (e.g., "monorepo", "hexagonal", "mvc", "none")
- databaseTech: database technology (e.g., "sqlite", "postgres", "none")
- packageManager: package manager (e.g., "bun", "npm", "yarn", "pnpm")

File list (first 100):
${files.slice(0, 100).join('\n')}

${packageJson ? `package.json:\n${packageJson.slice(0, 2000)}` : 'No package.json found.'}

Return ONLY valid JSON, no markdown fences, no explanation.`

    return this.callLlm<RepoMeta>(prompt, (json) => ({
      language: String(json.language ?? 'unknown'),
      framework: String(json.framework ?? 'none'),
      testFramework: String(json.testFramework ?? 'none'),
      entryPoints: Array.isArray(json.entryPoints) ? json.entryPoints.map(String) : [],
      buildSystem: String(json.buildSystem ?? 'none'),
      architectureStyle: String(json.architectureStyle ?? 'none'),
      databaseTech: String(json.databaseTech ?? 'none'),
      packageManager: String(json.packageManager ?? 'none'),
    }))
  }

  /** generateFileSummary
   * Descrição: Gera sumário L2 de um arquivo via LLM
   */
  async generateFileSummary(
    filePath: string,
    code: string,
  ): Promise<Result<FileSummary, EnrichmentError>> {
    const prompt = `Analyze this source file and return a JSON object:
- purpose: one-line description of what this file does
- exports: array of exported symbols (functions, classes, types)
- patterns: array of design patterns used (e.g., "singleton", "factory", "observer")
- importsExternal: array of external package imports
- importsInternal: array of internal/relative imports
- complexity: "low", "medium", or "high"

File: ${filePath}
\`\`\`
${code.slice(0, 3000)}
\`\`\`

Return ONLY valid JSON, no markdown fences, no explanation.`

    return this.callLlm<FileSummary>(prompt, (json) => ({
      purpose: String(json.purpose ?? ''),
      exports: Array.isArray(json.exports) ? json.exports.map(String) : [],
      patterns: Array.isArray(json.patterns) ? json.patterns.map(String) : [],
      importsExternal: Array.isArray(json.importsExternal) ? json.importsExternal.map(String) : [],
      importsInternal: Array.isArray(json.importsInternal) ? json.importsInternal.map(String) : [],
      complexity: ['low', 'medium', 'high'].includes(json.complexity) ? json.complexity : 'medium',
    }))
  }

  /** generateModuleSummary
   * Descrição: Gera sumário L1 de um módulo via LLM
   */
  async generateModuleSummary(
    modulePath: string,
    fileInfos: Array<{ path: string; exports: string[]; purpose: string }>,
  ): Promise<Result<ModuleSummary, EnrichmentError>> {
    const prompt = `Analyze this module/directory and return a JSON object:
- purpose: one-line description of the module's responsibility
- publicApi: array of main public exports from this module
- dependsOn: array of other modules this one depends on
- dependedBy: array of modules that depend on this one

Module: ${modulePath}
Files:
${fileInfos
  .slice(0, 20)
  .map((f) => `- ${f.path}: ${f.purpose} (exports: ${f.exports.join(', ')})`)
  .join('\n')}

Return ONLY valid JSON, no markdown fences, no explanation.`

    return this.callLlm<ModuleSummary>(prompt, (json) => ({
      purpose: String(json.purpose ?? ''),
      publicApi: Array.isArray(json.publicApi) ? json.publicApi.map(String) : [],
      dependsOn: Array.isArray(json.dependsOn) ? json.dependsOn.map(String) : [],
      dependedBy: Array.isArray(json.dependedBy) ? json.dependedBy.map(String) : [],
    }))
  }

  /** generatePatternAnalysis
   * Descrição: Gera análise L4 de padrões do codebase via LLM
   */
  async generatePatternAnalysis(
    samples: Array<{ path: string; content: string }>,
  ): Promise<Result<PatternAnalysis, EnrichmentError>> {
    const prompt = `Analyze these code samples and identify codebase conventions. Return a JSON object:
- namingFunctions: function naming convention (e.g., "camelCase")
- namingClasses: class naming convention (e.g., "PascalCase")
- namingConstants: constant naming convention (e.g., "UPPER_SNAKE_CASE")
- namingFiles: file naming convention (e.g., "kebab-case.ts")
- namingVariables: variable naming convention (e.g., "camelCase")
- errorHandling: error handling pattern (e.g., "Result type", "try-catch", "exceptions")
- importStyle: import style (e.g., "named imports", "barrel files")
- testingPatterns: testing patterns (e.g., "describe/it with vitest")
- architecturePatterns: architecture patterns (e.g., "hexagonal with ports/adapters")
- antiPatterns: any anti-patterns found (e.g., "none" or description)

Code samples:
${samples
  .slice(0, 10)
  .map((s) => `--- ${s.path} ---\n${s.content.slice(0, 1500)}`)
  .join('\n\n')}

Return ONLY valid JSON, no markdown fences, no explanation.`

    return this.callLlm<PatternAnalysis>(prompt, (json) => ({
      namingFunctions: String(json.namingFunctions ?? 'unknown'),
      namingClasses: String(json.namingClasses ?? 'unknown'),
      namingConstants: String(json.namingConstants ?? 'unknown'),
      namingFiles: String(json.namingFiles ?? 'unknown'),
      namingVariables: String(json.namingVariables ?? 'unknown'),
      errorHandling: String(json.errorHandling ?? 'unknown'),
      importStyle: String(json.importStyle ?? 'unknown'),
      testingPatterns: String(json.testingPatterns ?? 'unknown'),
      architecturePatterns: String(json.architecturePatterns ?? 'unknown'),
      antiPatterns: String(json.antiPatterns ?? 'none'),
    }))
  }

  /** callLlm
   * Descrição: Chama o LLM, parseia o JSON da resposta e aplica o mapper
   * @param prompt - Prompt a enviar ao LLM
   * @param mapper - Função que mapeia o JSON bruto para o tipo de saída
   * @returns Result com o valor mapeado ou EnrichmentError
   */
  private async callLlm<T>(
    prompt: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mapper: (json: any) => T,
  ): Promise<Result<T, EnrichmentError>> {
    try {
      const result = await this.provider.generateText({
        provider: this.providerName,
        model: this.modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        maxTokens: 2000,
      })

      const parsed = parseJsonResponse(result.text)
      if (!parsed) {
        return Err({ code: 'json_parse', message: `Failed to parse LLM response as JSON` })
      }

      return Ok(mapper(parsed))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
        return Err({ code: 'timeout', message })
      }
      return Err({ code: 'llm_unavailable', message })
    }
  }
}

/** parseJsonResponse
 * Descrição: Parseia resposta do LLM como JSON, removendo markdown fences se presentes
 * @param text - Texto bruto da resposta do LLM
 * @returns Objeto parseado ou null se inválido
 */
function parseJsonResponse(text: string): Record<string, unknown> | null {
  // Remove markdown fences (```json ... ```)
  let cleaned = text.trim()
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) {
    cleaned = fenceMatch[1]?.trim() ?? cleaned
  }

  // Tenta extrair primeiro { ... } do texto
  const jsonStart = cleaned.indexOf('{')
  const jsonEnd = cleaned.lastIndexOf('}')
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1)
  }

  try {
    const parsed = JSON.parse(cleaned)
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}
