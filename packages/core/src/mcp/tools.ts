/** MCP Tools
 * Descrição: Definições das 7 tools MCP do Codebase Intelligence.
 * Cada tool é um adapter fino sobre os handlers internos do indexer/graph.
 * Nunca duplica lógica de negócio — apenas traduz entre MCP SDK e chamada interna.
 */

import { z } from 'zod/v4'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CodebaseIndexer } from '../indexing/manager'
import type { DependencyGraph } from '../indexing/dependency-graph'

/** Cria resposta MCP de texto */
function textResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  }
}

function addSearchCodebase(mcp: McpServer, indexer: CodebaseIndexer): void {
  mcp.tool(
    'search_codebase',
    'Busca híbrida no índice do codebase (FTS5 + similaridade vetorial)',
    {
      query: z.string().describe('Texto de busca'),
      limit: z.number().optional().describe('Máximo de resultados (default: 10)'),
    },
    async ({ query, limit }) => {
      const results = await indexer.search(query, limit ?? 10)
      return textResult(
        results.map((r) => ({
          file: r.chunk.filePath,
          startLine: r.chunk.startLine,
          endLine: r.chunk.endLine,
          language: r.chunk.language,
          symbolName: r.chunk.symbolName,
          chunkType: r.chunk.chunkType,
          score: r.score,
          source: r.source,
          content: r.chunk.content,
        })),
      )
    },
  )
}

function addSearchSymbols(mcp: McpServer, indexer: CodebaseIndexer): void {
  mcp.tool(
    'search_symbols',
    'Busca por símbolos no codebase (funções, classes, interfaces)',
    {
      query: z.string().describe('Nome ou descrição do símbolo'),
      type: z
        .enum(['function', 'class', 'interface', 'method'])
        .optional()
        .describe('Filtrar por tipo de símbolo'),
    },
    async ({ query, type }) => {
      let results = await indexer.searchSymbols(query, 20)
      if (type) {
        results = results.filter((r) => r.chunk.chunkType === type)
      }
      return textResult(
        results.map((r) => ({
          symbolName: r.chunk.symbolName,
          file: r.chunk.filePath,
          line: r.chunk.startLine,
          type: r.chunk.chunkType,
          language: r.chunk.language,
          score: r.score,
          content: r.chunk.content,
        })),
      )
    },
  )
}

function addGetFileSummary(mcp: McpServer, indexer: CodebaseIndexer): void {
  mcp.tool(
    'get_file_summary',
    'Retorna resumo semântico (L2) de um arquivo do codebase',
    {
      filePath: z.string().describe('Caminho do arquivo (relativo ou absoluto)'),
    },
    async ({ filePath }) => {
      const contextData = indexer.getContextData([filePath])
      const summary = contextData.fileSummaries.find(
        (s) => s.filePath === filePath || s.filePath.endsWith(filePath),
      )
      if (!summary) {
        return {
          ...textResult({ error: 'File not found in index', filePath }),
          isError: true,
        }
      }
      return textResult({
        filePath: summary.filePath,
        purpose: summary.purpose,
        exports: summary.exports,
      })
    },
  )
}

function addImpactAnalysis(mcp: McpServer, graph: DependencyGraph): void {
  mcp.tool(
    'get_impact_analysis',
    'Analisa o impacto de uma mudança em um arquivo via grafo de dependências',
    { filePath: z.string().describe('Caminho do arquivo alterado') },
    async ({ filePath }) => {
      const impact = graph.getImpactAnalysis(filePath)
      return textResult({
        filePath,
        directDependents: impact.directDependents,
        transitiveDependents: impact.transitiveDependents,
        riskLevel: impact.riskLevel,
        impactedFiles: impact.transitiveDependents.length,
      })
    },
  )
}

function addGetDependencies(mcp: McpServer, graph: DependencyGraph): void {
  mcp.tool(
    'get_dependencies',
    'Retorna as dependências diretas (imports) de um arquivo',
    { filePath: z.string().describe('Caminho do arquivo') },
    async ({ filePath }) => {
      const deps = graph.getDirectDependencies(filePath)
      const dependents = graph.getDirectDependents(filePath)
      return textResult({
        filePath,
        imports: deps.map((to) => ({ from: filePath, to, type: 'import' })),
        importedBy: dependents.map((from) => ({ from, to: filePath, type: 'import' })),
      })
    },
  )
}

function addIndexWorkspace(mcp: McpServer, indexer: CodebaseIndexer): void {
  mcp.tool('index_workspace', 'Dispara (re-)indexação do workspace atual', {}, async () => {
    const startTime = Date.now()
    const stats = await indexer.indexWorkspace()
    const durationMs = Date.now() - startTime
    return textResult({
      totalFiles: stats.totalFiles,
      totalChunks: stats.totalChunks,
      hasVectors: stats.hasVectors,
      durationMs,
    })
  })
}

function addGetIndexStatus(mcp: McpServer, indexer: CodebaseIndexer): void {
  mcp.tool('get_index_status', 'Retorna o status atual da indexação do codebase', {}, async () => {
    const stats = indexer.getStats()
    return textResult({
      totalFiles: stats.totalFiles,
      totalChunks: stats.totalChunks,
      hasVectors: stats.hasVectors,
      lastIndexed: stats.indexedAt?.toISOString() ?? null,
      workspacePath: stats.workspacePath,
    })
  })
}

/** registerTools — Registra todas as 7 tools MCP no servidor */
export function registerTools(
  mcp: McpServer,
  indexer: CodebaseIndexer,
  graph: DependencyGraph,
): void {
  addSearchCodebase(mcp, indexer)
  addSearchSymbols(mcp, indexer)
  addGetFileSummary(mcp, indexer)
  addImpactAnalysis(mcp, graph)
  addGetDependencies(mcp, graph)
  addIndexWorkspace(mcp, indexer)
  addGetIndexStatus(mcp, indexer)
}
