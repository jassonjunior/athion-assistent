import { describe, expect, it } from 'vitest'
import { createBus } from './bus'
import {
  McpClientConnected,
  McpToolCalled,
  McpClientDisconnected,
  WorkspaceRegistered,
  CrossSearchCompleted,
  RemoteCloned,
  RemoteCleanedUp,
} from './events'

describe('Phase 2 Bus Events', () => {
  describe('MCP Events', () => {
    it('McpClientConnected publica e recebe corretamente', () => {
      const bus = createBus()
      const received: unknown[] = []
      bus.subscribe(McpClientConnected, (data) => received.push(data))

      bus.publish(McpClientConnected, { clientId: 'c1', transport: 'stdio' })

      expect(received).toEqual([{ clientId: 'c1', transport: 'stdio' }])
    })

    it('McpToolCalled publica métricas da tool', () => {
      const bus = createBus()
      const received: unknown[] = []
      bus.subscribe(McpToolCalled, (data) => received.push(data))

      bus.publish(McpToolCalled, {
        clientId: 'c1',
        toolName: 'search_codebase',
        durationMs: 150,
        success: true,
      })

      expect(received[0]).toEqual({
        clientId: 'c1',
        toolName: 'search_codebase',
        durationMs: 150,
        success: true,
      })
    })

    it('McpClientDisconnected publica clientId', () => {
      const bus = createBus()
      const received: unknown[] = []
      bus.subscribe(McpClientDisconnected, (data) => received.push(data))

      bus.publish(McpClientDisconnected, { clientId: 'c1' })

      expect(received[0]).toEqual({ clientId: 'c1' })
    })
  })

  describe('Workspace Events', () => {
    it('WorkspaceRegistered publica id e path', () => {
      const bus = createBus()
      const received: unknown[] = []
      bus.subscribe(WorkspaceRegistered, (data) => received.push(data))

      bus.publish(WorkspaceRegistered, { workspaceId: 'ws1', path: '/home/project' })

      expect(received[0]).toEqual({ workspaceId: 'ws1', path: '/home/project' })
    })

    it('CrossSearchCompleted publica métricas de busca', () => {
      const bus = createBus()
      const received: unknown[] = []
      bus.subscribe(CrossSearchCompleted, (data) => received.push(data))

      bus.publish(CrossSearchCompleted, {
        query: 'createUser',
        workspaceCount: 3,
        totalResults: 15,
        durationMs: 200,
      })

      expect(received[0]).toEqual(
        expect.objectContaining({
          query: 'createUser',
          workspaceCount: 3,
          totalResults: 15,
        }),
      )
    })
  })

  describe('Remote Events', () => {
    it('RemoteCloned publica url e localPath', () => {
      const bus = createBus()
      const received: unknown[] = []
      bus.subscribe(RemoteCloned, (data) => received.push(data))

      bus.publish(RemoteCloned, {
        url: 'https://github.com/test/repo',
        localPath: '/tmp/repos/repo',
        durationMs: 5000,
      })

      expect(received[0]).toEqual(
        expect.objectContaining({
          url: 'https://github.com/test/repo',
          localPath: '/tmp/repos/repo',
        }),
      )
    })

    it('RemoteCleanedUp publica motivo', () => {
      const bus = createBus()
      const received: unknown[] = []
      bus.subscribe(RemoteCleanedUp, (data) => received.push(data))

      bus.publish(RemoteCleanedUp, {
        url: 'https://github.com/test/repo',
        reason: 'expired after 30 days',
      })

      expect(received[0]).toEqual(
        expect.objectContaining({
          reason: 'expired after 30 days',
        }),
      )
    })
  })
})
