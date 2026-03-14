/** NoopEnricher
 * Descrição: Implementação no-op do LlmEnricherPort que retorna dados mínimos
 * sem chamar o LLM. Usado quando codebaseEnrichmentEnabled = false.
 */

import { Ok } from '../result'
import type { Result } from '../result'
import type {
  LlmEnricherPort,
  EnrichmentError,
  RepoMeta,
  FileSummary,
  ModuleSummary,
  PatternAnalysis,
} from '../ports/llm-enricher.port'

/** NoopEnricher
 * Descrição: Adapter no-op que retorna dados mínimos sem chamar LLM.
 * Garante que o sistema funciona mesmo sem enriquecimento habilitado.
 */
export class NoopEnricher implements LlmEnricherPort {
  async isAvailable(): Promise<boolean> {
    return false
  }

  async generateRepoMeta(): Promise<Result<RepoMeta, EnrichmentError>> {
    return Ok({
      language: 'unknown',
      framework: 'none',
      testFramework: 'none',
      entryPoints: [],
      buildSystem: 'none',
      architectureStyle: 'none',
      databaseTech: 'none',
      packageManager: 'none',
    })
  }

  async generateFileSummary(): Promise<Result<FileSummary, EnrichmentError>> {
    return Ok({
      purpose: '',
      exports: [],
      patterns: [],
      importsExternal: [],
      importsInternal: [],
      complexity: 'medium',
    })
  }

  async generateModuleSummary(): Promise<Result<ModuleSummary, EnrichmentError>> {
    return Ok({
      purpose: '',
      publicApi: [],
      dependsOn: [],
      dependedBy: [],
    })
  }

  async generatePatternAnalysis(): Promise<Result<PatternAnalysis, EnrichmentError>> {
    return Ok({
      namingFunctions: 'unknown',
      namingClasses: 'unknown',
      namingConstants: 'unknown',
      namingFiles: 'unknown',
      namingVariables: 'unknown',
      errorHandling: 'unknown',
      importStyle: 'unknown',
      testingPatterns: 'unknown',
      architecturePatterns: 'unknown',
      antiPatterns: 'none',
    })
  }
}
