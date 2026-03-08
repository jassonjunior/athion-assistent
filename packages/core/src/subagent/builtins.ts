import type { SubAgentConfig } from './types'

/**
 * SubAgent de busca e analise de codigo.
 * Usa a skill 'search' para investigar o codebase sem fazer alteracoes.
 */
export const searchAgent: SubAgentConfig = {
  name: 'search',
  description:
    'Searches and analyzes code, files, and project structure. Read-only — never modifies files.',
  skill: 'search',
  tools: ['read_file', 'list_files', 'search_files'],
  maxTurns: 30,
  level: 'builtin',
}

/**
 * SubAgent de codificacao.
 * Usa a skill 'coder' para gerar, criar e modificar arquivos de codigo.
 */
export const coderAgent: SubAgentConfig = {
  name: 'coder',
  description:
    'Generates code from scratch and modifies existing files. Analyzes context, creates the implementation, and writes the files.',
  skill: 'coder',
  tools: ['read_file', 'write_file', 'list_files', 'search_files'],
  maxTurns: 50,
  level: 'builtin',
}

/**
 * SubAgent de code review.
 * Usa a skill 'code-review' para analisar codigo. Somente leitura.
 */
export const codeReviewAgent: SubAgentConfig = {
  name: 'code-reviewer',
  description: 'Reviews code for bugs, security issues, and improvements. Read-only analysis.',
  skill: 'code-review',
  tools: ['read_file', 'list_files', 'search_files'],
  maxTurns: 20,
  level: 'builtin',
}

/**
 * SubAgent de refatoracao.
 * Usa a skill 'refactor' para reestruturar codigo preservando comportamento.
 */
export const refactorAgent: SubAgentConfig = {
  name: 'refactorer',
  description:
    'Restructures code while preserving existing behavior. Makes surgical, verifiable changes.',
  skill: 'refactor',
  tools: ['read_file', 'write_file', 'list_files', 'search_files'],
  maxTurns: 40,
  level: 'builtin',
}

/**
 * SubAgent de explicacao.
 * Usa a skill 'explain' para explicar codigo e conceitos. Somente leitura.
 */
export const explainAgent: SubAgentConfig = {
  name: 'explainer',
  description: 'Explains code, concepts, and technical decisions in a clear and structured way.',
  skill: 'explain',
  tools: ['read_file', 'list_files', 'search_files'],
  maxTurns: 15,
  level: 'builtin',
}

/**
 * SubAgent de escrita de testes.
 * Usa a skill 'test-writer' para criar testes unitarios e de integracao.
 */
export const testWriterAgent: SubAgentConfig = {
  name: 'test-writer',
  description: 'Writes unit and integration tests for existing code following project conventions.',
  skill: 'test-writer',
  tools: ['read_file', 'write_file', 'list_files', 'search_files'],
  maxTurns: 30,
  level: 'builtin',
}

/**
 * SubAgent de debug.
 * Usa a skill 'debug' para diagnosticar e corrigir bugs.
 */
export const debugAgent: SubAgentConfig = {
  name: 'debugger',
  description:
    'Diagnoses and fixes bugs using systematic investigation. Reads code, forms hypotheses, applies minimal fixes.',
  skill: 'debug',
  tools: ['read_file', 'write_file', 'list_files', 'search_files', 'run_command'],
  maxTurns: 40,
  level: 'builtin',
}

/**
 * Todos os subagentes built-in.
 * Usados pelo orchestrator para registrar no SubAgentManager na inicializacao.
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
