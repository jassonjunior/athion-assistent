import type { SubAgentConfig } from './types'

/** searchAgent
 * Descrição: SubAgent de busca e análise de código.
 * Usa a skill 'search' para investigar o codebase sem fazer alterações.
 */
export const searchAgent: SubAgentConfig = {
  name: 'search',
  description:
    'Searches and analyzes code, files, and project structure. Read-only — never modifies files. Prefers search_codebase (semantic index) first; falls back to search_files (grep) if index has no results.',
  skill: 'search',
  tools: ['search_codebase', 'read_file', 'list_files', 'search_files'],
  maxTurns: 30,
  level: 'builtin',
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
  coderAgent,
  codeReviewAgent,
  refactorAgent,
  explainAgent,
  testWriterAgent,
  debugAgent,
]
