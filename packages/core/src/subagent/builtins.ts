import type { SubAgentConfig } from './types'

/** searchAgent
 * Descrição: SubAgent de busca semântica via codebase index.
 * Usa APENAS search_codebase. Se não encontrar, delega para search-tools
 * via task tool (fallback interno).
 */
export const searchAgent: SubAgentConfig = {
  name: 'search',
  description:
    'Searches and analyzes code using the semantic codebase index (search_codebase). Read-only — never modifies files. If the index is insufficient, delegates to search-tools agent for file system access.',
  skill: 'search',
  tools: ['search_codebase', 'task'],
  maxTurns: 15,
  level: 'builtin',
}

/** searchToolsAgent
 * Descrição: SubAgent de busca via ferramentas de sistema de arquivos.
 * Usado internamente pelo search agent quando o índice semântico não basta.
 * Não aparece na lista de agents do orchestrator (level: 'internal').
 */
export const searchToolsAgent: SubAgentConfig = {
  name: 'search-tools',
  description:
    'Searches code using file system tools (read_file, list_files, search_files/grep). Internal fallback for the search agent.',
  skill: 'search-tools',
  tools: ['read_file', 'list_files', 'search_files'],
  maxTurns: 20,
  level: 'internal',
}

/** coderAgent
 * Descrição: SubAgent de codificação.
 * Usa a skill 'coder' para gerar, criar e modificar arquivos de código.
 */
export const coderAgent: SubAgentConfig = {
  name: 'coder',
  description:
    'Generates code from scratch and modifies existing files. Analyzes context, creates the implementation, and writes the files.',
  skill: 'coder',
  tools: ['search_codebase', 'read_file', 'write_file', 'list_files', 'search_files'],
  maxTurns: 50,
  level: 'builtin',
}

/** codeReviewAgent
 * Descrição: SubAgent de code review.
 * Usa a skill 'code-review' para analisar código. Somente leitura.
 */
export const codeReviewAgent: SubAgentConfig = {
  name: 'code-review',
  description: 'Reviews code for bugs, security issues, and improvements. Read-only analysis.',
  skill: 'code-review',
  tools: ['search_codebase', 'read_file', 'list_files', 'search_files'],
  maxTurns: 20,
  level: 'builtin',
}

/** refactorAgent
 * Descrição: SubAgent de refatoração.
 * Usa a skill 'refactor' para reestruturar código preservando comportamento.
 */
export const refactorAgent: SubAgentConfig = {
  name: 'refactorer',
  description:
    'Restructures code while preserving existing behavior. Makes surgical, verifiable changes.',
  skill: 'refactor',
  tools: ['search_codebase', 'read_file', 'write_file', 'list_files', 'search_files'],
  maxTurns: 40,
  level: 'builtin',
}

/** explainAgent
 * Descrição: SubAgent de explicação.
 * Usa a skill 'explain' para explicar código e conceitos. Somente leitura.
 */
export const explainAgent: SubAgentConfig = {
  name: 'explainer',
  description: 'Explains code, concepts, and technical decisions in a clear and structured way.',
  skill: 'explain',
  tools: ['search_codebase', 'read_file', 'list_files', 'search_files'],
  maxTurns: 15,
  level: 'builtin',
}

/** testWriterAgent
 * Descrição: SubAgent de escrita de testes.
 * Usa a skill 'test-writer' para criar testes unitários e de integração.
 */
export const testWriterAgent: SubAgentConfig = {
  name: 'test-writer',
  description: 'Writes unit and integration tests for existing code following project conventions.',
  skill: 'test-writer',
  tools: ['search_codebase', 'read_file', 'write_file', 'list_files', 'search_files'],
  maxTurns: 30,
  level: 'builtin',
}

/** debugAgent
 * Descrição: SubAgent de debug.
 * Usa a skill 'debug' para diagnosticar e corrigir bugs.
 */
export const debugAgent: SubAgentConfig = {
  name: 'debugger',
  description:
    'Diagnoses and fixes bugs using systematic investigation. Reads code, forms hypotheses, applies minimal fixes.',
  skill: 'debug',
  tools: [
    'search_codebase',
    'read_file',
    'write_file',
    'list_files',
    'search_files',
    'run_command',
  ],
  maxTurns: 40,
  level: 'builtin',
}

/** builtinAgents
 * Descrição: Todos os subagentes built-in do Athion.
 * Usados pelo orchestrator para registrar no SubAgentManager na inicialização.
 */
export const builtinAgents: SubAgentConfig[] = [
  searchAgent,
  searchToolsAgent,
  coderAgent,
  codeReviewAgent,
  refactorAgent,
  explainAgent,
  testWriterAgent,
  debugAgent,
]
