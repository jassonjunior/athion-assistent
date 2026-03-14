/** MCP Server
 * Descrição: Servidor MCP (Model Context Protocol) que expõe o Codebase Intelligence
 * como tools e resources para clientes MCP (Claude Code, Cursor, etc.).
 * Atua como adapter protocol-agnostic: reutiliza os mesmos handlers internos
 * do indexer/graph sem duplicar lógica.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import type { Bus } from '../bus/bus'
import type { CodebaseIndexer } from '../indexing/manager'
import type { DependencyGraph } from '../indexing/dependency-graph'
import { McpClientConnected, McpClientDisconnected } from '../bus/events'
import { registerTools } from './tools'
import { registerResources } from './resources'

/** McpServerConfig
 * Descrição: Configuração para criação do servidor MCP
 */
export interface McpServerConfig {
  indexer: CodebaseIndexer
  graph: DependencyGraph
  bus: Bus
  transport: 'stdio' | 'sse'
  ssePort?: number
}

/** AthionMcpServer
 * Descrição: Wrapper do servidor MCP com lifecycle management
 */
export interface AthionMcpServer {
  /** start - Inicia o servidor e conecta ao transporte */
  start(): Promise<void>
  /** close - Encerra o servidor */
  close(): Promise<void>
  /** server - Instância interna do McpServer */
  server: McpServer
}

/** createMcpServer
 * Descrição: Factory para criar o servidor MCP com todas as tools e resources registradas.
 * Segue o padrão factory do codebase (createBus, createCodebaseIndexer, etc.).
 * @param config - Configuração com indexer, graph, bus e transporte
 * @returns AthionMcpServer pronto para start()
 */
export function createMcpServer(config: McpServerConfig): AthionMcpServer {
  const { indexer, graph, bus, transport } = config
  const clientId = `athion-mcp-${Date.now()}`

  const mcp = new McpServer(
    {
      name: 'athion-codebase-intelligence',
      version: '2.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  )

  // Registra tools e resources
  registerTools(mcp, indexer, graph)
  registerResources(mcp, indexer, graph)

  async function start(): Promise<void> {
    if (transport === 'stdio') {
      const stdioTransport = new StdioServerTransport()
      await mcp.connect(stdioTransport)
      bus.publish(McpClientConnected, { clientId, transport: 'stdio' })
    } else {
      // SSE transport — requer servidor HTTP externo
      // Por enquanto, usa stdio como fallback (SSE será implementado com o CLI)
      const stdioTransport = new StdioServerTransport()
      await mcp.connect(stdioTransport)
      bus.publish(McpClientConnected, { clientId, transport: 'sse' })
    }
  }

  async function close(): Promise<void> {
    bus.publish(McpClientDisconnected, { clientId })
    await mcp.close()
  }

  return { start, close, server: mcp }
}
