import { describe, expect, it, vi } from 'vitest'
import { createMcpServer } from './server'
import { createBus } from '../bus/bus'
import { DependencyGraph } from '../indexing/dependency-graph'
import type { CodebaseIndexer } from '../indexing/manager'
import { McpClientDisconnected } from '../bus/events'

/** Mock do CodebaseIndexer com métodos mínimos usados pelas tools/resources */
function createMockIndexer(): CodebaseIndexer {
  return {
    search: vi.fn().mockResolvedValue([]),
    searchSymbols: vi.fn().mockResolvedValue([]),
    getContextData: vi.fn().mockReturnValue({
      repoMeta: { stack: 'typescript' },
      patterns: { naming: 'camelCase' },
      fileSummaries: [],
    }),
    indexWorkspace: vi.fn().mockResolvedValue({
      totalFiles: 10,
      totalChunks: 50,
      hasVectors: false,
    }),
    getStats: vi.fn().mockReturnValue({
      totalFiles: 10,
      totalChunks: 50,
      hasVectors: false,
      indexedAt: new Date(),
      workspacePath: '/test',
    }),
    close: vi.fn().mockResolvedValue(undefined),
  } as unknown as CodebaseIndexer
}

describe('createMcpServer', () => {
  it('cria servidor com interface correta', () => {
    const bus = createBus()
    const indexer = createMockIndexer()
    const graph = new DependencyGraph()

    const mcpServer = createMcpServer({
      indexer,
      graph,
      bus,
      transport: 'stdio',
    })

    expect(mcpServer).toHaveProperty('start')
    expect(mcpServer).toHaveProperty('close')
    expect(mcpServer).toHaveProperty('server')
    expect(typeof mcpServer.start).toBe('function')
    expect(typeof mcpServer.close).toBe('function')
  })

  it('close() publica McpClientDisconnected no bus', async () => {
    const bus = createBus()
    const indexer = createMockIndexer()
    const graph = new DependencyGraph()

    const events: unknown[] = []
    bus.subscribe(McpClientDisconnected, (data) => events.push(data))

    const mcpServer = createMcpServer({
      indexer,
      graph,
      bus,
      transport: 'stdio',
    })

    await mcpServer.close()

    expect(events.length).toBe(1)
    expect((events[0] as { clientId: string }).clientId).toContain('athion-mcp-')
  })

  it('aceita transporte sse com porta customizada', () => {
    const bus = createBus()
    const indexer = createMockIndexer()
    const graph = new DependencyGraph()

    const mcpServer = createMcpServer({
      indexer,
      graph,
      bus,
      transport: 'sse',
      ssePort: 4200,
    })

    expect(mcpServer.server).toBeTruthy()
  })
})
