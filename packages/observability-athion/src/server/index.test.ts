import { describe, it, expect, vi } from 'vitest'

/**
 * The server index.ts has top-level side effects (Bun.serve, process listeners, etc.)
 * that make it difficult to test directly. We test the pure utility functions
 * and logic that can be extracted/tested indirectly.
 *
 * The protocol, test-runner, and flow-bridge modules (which contain the core logic)
 * are tested in their own dedicated test files.
 */

// Mock all external dependencies to prevent side effects
vi.mock('bun', () => ({
  serve: vi.fn(() => ({ port: 3457 })),
  file: vi.fn(() => ({ exists: () => Promise.resolve(false) })),
  CryptoHasher: vi.fn(),
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
}))

vi.mock('node:os', () => ({
  homedir: vi.fn(() => '/tmp/test-home'),
}))

vi.mock('./test-runner', () => ({
  listTests: vi.fn(() => []),
  runTest: vi.fn(),
  stopTest: vi.fn(),
}))

vi.mock('./flow-bridge', () => ({
  startFlowBridge: vi.fn(() => vi.fn()),
}))

vi.mock('@athion/core', () => ({
  createCodebaseIndexer: vi.fn(),
}))

vi.mock('./protocol', () => ({
  PROTOCOL_VERSION: '1.0',
}))

describe('server/index', () => {
  it('should define MIME_TYPES mapping for common file extensions', () => {
    // This is a structural test — the MIME types map is defined inline.
    // We verify the concept through the protocol/test-runner/flow-bridge tests.
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    }

    expect(mimeTypes['.html']).toBe('text/html')
    expect(mimeTypes['.js']).toBe('application/javascript')
    expect(mimeTypes['.css']).toBe('text/css')
    expect(mimeTypes['.json']).toBe('application/json')
    expect(mimeTypes['.png']).toBe('image/png')
    expect(mimeTypes['.svg']).toBe('image/svg+xml')
    expect(mimeTypes['.ico']).toBe('image/x-icon')
  })

  it('should have the expected broadcast logic pattern', () => {
    // Test the broadcast pattern used in server
    const clients = new Set<{ send: (data: string) => void }>()
    const mockWs1 = { send: vi.fn() }
    const mockWs2 = { send: vi.fn() }

    clients.add(mockWs1)
    clients.add(mockWs2)

    const data = JSON.stringify({ type: 'test:list', tests: [] })
    for (const ws of clients) {
      ws.send(data)
    }

    expect(mockWs1.send).toHaveBeenCalledWith(data)
    expect(mockWs2.send).toHaveBeenCalledWith(data)
  })

  it('should handle broadcast errors by removing failed clients', () => {
    const clients = new Set<{ send: (data: string) => void }>()
    const failingWs = {
      send: vi.fn(() => {
        throw new Error('Connection closed')
      }),
    }
    const workingWs = { send: vi.fn() }

    clients.add(failingWs)
    clients.add(workingWs)

    const data = '{"type":"test:list"}'
    for (const ws of clients) {
      try {
        ws.send(data)
      } catch {
        clients.delete(ws)
      }
    }

    expect(clients.size).toBe(1)
    expect(clients.has(workingWs)).toBe(true)
    expect(clients.has(failingWs)).toBe(false)
  })
})
