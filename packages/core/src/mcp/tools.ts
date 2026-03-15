/** MCP Tools
 * Descrição: Definições das 7 tools MCP do Codebase Intelligence.
 * Cada tool é um adapter fino sobre os handlers internos do indexer/graph.
 * Nunca duplica lógica de negócio — apenas traduz entre MCP SDK e chamada interna.
 */

import { z } from 'zod/v4'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CodebaseIndexer } from '../indexing/manager'
import type { DependencyGraph } from '../indexing/dependency-graph'
import { WorkspaceRegistry } from '../indexing/workspace-registry'
import { crossWorkspaceSearch } from '../indexing/cross-workspace-search'

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

function addListWorkspaces(mcp: McpServer): void {
  mcp.tool(
    'list_workspaces',
    'Lista todos os workspaces registrados para indexação multi-workspace',
    {},
    async () => {
      const registry = new WorkspaceRegistry()
      const workspaces = registry.list()
      return textResult(
        workspaces.map((ws) => ({
          id: ws.id,
          name: ws.name,
          path: ws.path,
          isActive: ws.isActive,
          lastIndexed: ws.lastIndexed,
          remote: ws.remote ? { url: ws.remote.url, branch: ws.remote.branch } : undefined,
        })),
      )
    },
  )
}

function addCrossWorkspaceSearch(mcp: McpServer): void {
  mcp.tool(
    'cross_workspace_search',
    'Busca em múltiplos workspaces simultaneamente com merge por score',
    {
      query: z.string().describe('Texto de busca'),
      limit: z.number().optional().describe('Máximo de resultados (default: 10)'),
      workspaces: z
        .array(z.string())
        .optional()
        .describe('IDs dos workspaces (se omitido, busca em todos os ativos)'),
    },
    async ({ query, limit, workspaces }) => {
      const registry = new WorkspaceRegistry()
      const result = await crossWorkspaceSearch(registry, {
        query,
        limit: limit ?? 10,
        ...(workspaces !== undefined ? { workspaces } : {}),
        mergeStrategy: 'interleave',
        timeoutMs: 5000,
      })
      return textResult({
        results: result.results.map((r) => ({
          workspaceId: r.workspaceId,
          workspaceName: r.workspaceName,
          file: r.file,
          startLine: r.startLine,
          symbolName: r.symbolName,
          score: r.score,
          source: r.source,
          content: r.content,
        })),
        errors: result.errors,
        stats: result.stats,
      })
    },
  )
}

function addManageWorkspace(mcp: McpServer): void {
  mcp.tool(
    'manage_workspace',
    'Adiciona ou remove workspaces do registro multi-workspace',
    {
      action: z.enum(['add', 'remove', 'activate', 'deactivate']).describe('Ação a executar'),
      path: z.string().optional().describe('Caminho do workspace (para add)'),
      id: z.string().optional().describe('ID do workspace (para remove/activate/deactivate)'),
      name: z.string().optional().describe('Nome amigável (para add)'),
    },
    async ({ action, path, id, name }) => {
      const registry = new WorkspaceRegistry()

      if (action === 'add') {
        if (!path) return { ...textResult({ error: 'path é obrigatório para add' }), isError: true }
        const ws = registry.add(path, name)
        return textResult({
          action: 'added',
          workspace: { id: ws.id, name: ws.name, path: ws.path },
        })
      }

      if (!id) return { ...textResult({ error: 'id é obrigatório para esta ação' }), isError: true }

      if (action === 'remove') {
        const removed = registry.remove(id)
        return textResult({ action: 'removed', success: removed, id })
      }

      if (action === 'activate') {
        registry.setActive(id, true)
        return textResult({ action: 'activated', id })
      }

      registry.setActive(id, false)
      return textResult({ action: 'deactivated', id })
    },
  )
}

/** registerTools — Registra todas as 10 tools MCP no servidor */
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
  addListWorkspaces(mcp)
  addCrossWorkspaceSearch(mcp)
  addManageWorkspace(mcp)
}
