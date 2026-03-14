/** MCP Resources
 * Descrição: Definições dos resources MCP do Codebase Intelligence.
 * Resources são dados estáticos/cached que o cliente pode ler sob demanda.
 * Seguem URIs no formato athion:// para namespacing.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CodebaseIndexer } from '../indexing/manager'
import type { DependencyGraph } from '../indexing/dependency-graph'

/** registerIndexResources — Resources do indexer (repo-meta, patterns, modules) */
function registerIndexResources(mcp: McpServer, indexer: CodebaseIndexer): void {
  mcp.resource(
    'repo-meta',
    'athion://repo-meta',
    { description: 'Metadata L0 do repositório (stack, linguagens, framework)' },
    async () => {
      const contextData = indexer.getContextData()
      return {
        contents: [
          {
            uri: 'athion://repo-meta',
            mimeType: 'application/json',
            text: JSON.stringify(contextData.repoMeta ?? { status: 'not_enriched' }, null, 2),
          },
        ],
      }
    },
  )

  mcp.resource(
    'patterns',
    'athion://patterns',
    { description: 'Padrões L4 do codebase (naming, error handling, architecture)' },
    async () => {
      const contextData = indexer.getContextData()
      return {
        contents: [
          {
            uri: 'athion://patterns',
            mimeType: 'application/json',
            text: JSON.stringify(contextData.patterns ?? { status: 'not_enriched' }, null, 2),
          },
        ],
      }
    },
  )

  mcp.resource(
    'modules',
    'athion://modules',
    { description: 'Índice de módulos L1 do codebase (lista de módulos com propósito)' },
    async () => {
      const contextData = indexer.getContextData()
      return {
        contents: [
          {
            uri: 'athion://modules',
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                modules: contextData.fileSummaries.map((s) => ({
                  filePath: s.filePath,
                  purpose: s.purpose,
                  exports: s.exports,
                })),
              },
              null,
              2,
            ),
          },
        ],
      }
    },
  )
}

/** registerGraphResources — Resources do dependency graph */
function registerGraphResources(mcp: McpServer, graph: DependencyGraph): void {
  mcp.resource(
    'graph-stats',
    'athion://graph-stats',
    { description: 'Estatísticas do grafo de dependências (files, edges, avg, max)' },
    async () => {
      const stats = graph.getStats()
      return {
        contents: [
          {
            uri: 'athion://graph-stats',
            mimeType: 'application/json',
            text: JSON.stringify(stats, null, 2),
          },
        ],
      }
    },
  )

  mcp.resource(
    'dependency-graph',
    'athion://dependency-graph',
    { description: 'Grafo de dependências completo serializado (JSON)' },
    async () => {
      const serialized = graph.toJSON()
      return {
        contents: [
          {
            uri: 'athion://dependency-graph',
            mimeType: 'application/json',
            text: JSON.stringify(serialized, null, 2),
          },
        ],
      }
    },
  )
}

/** registerResources
 * Descrição: Registra todos os resources MCP no servidor.
 * @param mcp - Instância do McpServer
 * @param indexer - CodebaseIndexer para dados do índice
 * @param graph - DependencyGraph para estatísticas
 */
export function registerResources(
  mcp: McpServer,
  indexer: CodebaseIndexer,
  graph: DependencyGraph,
): void {
  registerIndexResources(mcp, indexer)
  registerGraphResources(mcp, graph)
}
