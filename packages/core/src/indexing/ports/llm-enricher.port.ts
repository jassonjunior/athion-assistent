/** LlmEnricherPort
 * Descrição: Interface (port) para enriquecimento semântico via LLM.
 * Gera metadados de alto nível (L0, L1, L2, L4) a partir de código-fonte.
 * Segue Hexagonal Architecture — ProviderEnricher (real) e NoopEnricher (mock).
 */

import type { Result } from '../result'

/** EnrichmentError
 * Descrição: Erro específico de enriquecimento LLM
 */
export interface EnrichmentError {
  /** code
   * Descrição: Código do erro (json_parse, llm_unavailable, timeout, unknown)
   */
  code: 'json_parse' | 'llm_unavailable' | 'timeout' | 'unknown'
  /** message
   * Descrição: Mensagem descritiva do erro
   */
  message: string
}

/** RepoMeta
 * Descrição: Metadata do repositório (L0) gerada pelo LLM
 */
export interface RepoMeta {
  language: string
  framework: string
  testFramework: string
  entryPoints: string[]
  buildSystem: string
  architectureStyle: string
  databaseTech: string
  packageManager: string
}

/** FileSummary
 * Descrição: Sumário semântico de um arquivo (L2) gerado pelo LLM
 */
export interface FileSummary {
  purpose: string
  exports: string[]
  patterns: string[]
  importsExternal: string[]
  importsInternal: string[]
  complexity: 'low' | 'medium' | 'high'
}

/** ModuleSummary
 * Descrição: Sumário semântico de um módulo/diretório (L1) gerado pelo LLM
 */
export interface ModuleSummary {
  purpose: string
  publicApi: string[]
  dependsOn: string[]
  dependedBy: string[]
}

/** PatternAnalysis
 * Descrição: Análise de padrões e convenções do codebase (L4)
 */
export interface PatternAnalysis {
  namingFunctions: string
  namingClasses: string
  namingConstants: string
  namingFiles: string
  namingVariables: string
  errorHandling: string
  importStyle: string
  testingPatterns: string
  architecturePatterns: string
  antiPatterns: string
}

/** LlmEnricherPort
 * Descrição: Port para enriquecimento semântico via LLM.
 * Implementações: ProviderEnricher (com LLM) e NoopEnricher (sem LLM).
 */
export interface LlmEnricherPort {
  /** isAvailable
   * Descrição: Verifica se o LLM está disponível para enriquecimento
   * @returns true se o LLM pode ser chamado
   */
  isAvailable(): Promise<boolean>

  /** generateRepoMeta
   * Descrição: Gera metadata do repositório (L0) a partir da lista de arquivos
   * @param files - Lista de caminhos de arquivo do workspace
   * @param packageJson - Conteúdo do package.json (se existir)
   * @returns Result com RepoMeta ou EnrichmentError
   */
  generateRepoMeta(
    files: string[],
    packageJson?: string,
  ): Promise<Result<RepoMeta, EnrichmentError>>

  /** generateFileSummary
   * Descrição: Gera sumário semântico de um arquivo (L2)
   * @param filePath - Caminho do arquivo
   * @param code - Conteúdo do arquivo
   * @returns Result com FileSummary ou EnrichmentError
   */
  generateFileSummary(filePath: string, code: string): Promise<Result<FileSummary, EnrichmentError>>

  /** generateModuleSummary
   * Descrição: Gera sumário semântico de um módulo (L1)
   * @param modulePath - Caminho do diretório do módulo
   * @param fileInfos - Informações dos arquivos do módulo
   * @returns Result com ModuleSummary ou EnrichmentError
   */
  generateModuleSummary(
    modulePath: string,
    fileInfos: Array<{ path: string; exports: string[]; purpose: string }>,
  ): Promise<Result<ModuleSummary, EnrichmentError>>

  /** generatePatternAnalysis
   * Descrição: Analisa padrões e convenções do codebase (L4)
   * @param samples - Amostras de código representativas
   * @returns Result com PatternAnalysis ou EnrichmentError
   */
  generatePatternAnalysis(
    samples: Array<{ path: string; content: string }>,
  ): Promise<Result<PatternAnalysis, EnrichmentError>>
}
