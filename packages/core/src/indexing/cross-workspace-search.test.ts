import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceRegistry } from './workspace-registry'
import type { WorkspaceInfo } from './workspace-types'

// Mock do manager para evitar import de bun:sqlite
vi.mock('./manager.js', () => ({
  createCodebaseIndexer: vi.fn(() => {
    throw new Error('Index DB not found')
  }),
}))

// Import após mock
const { crossWorkspaceSearch } = await import('./cross-workspace-search.js')

/** Mock do WorkspaceRegistry */
function createMockRegistry(workspaces: WorkspaceInfo[]): WorkspaceRegistry {
  return {
    list: () => [...workspaces],
    activeWorkspaces: () => workspaces.filter((w) => w.isActive),
    get: (id: string) => workspaces.find((w) => w.id === id),
    getByPath: (path: string) => workspaces.find((w) => w.path === path),
    add: vi.fn(),
    addRemote: vi.fn(),
    remove: vi.fn(),
    updateLastIndexed: vi.fn(),
    setActive: vi.fn(),
    count: () => workspaces.length,
  } as unknown as WorkspaceRegistry
}

describe('crossWorkspaceSearch', () => {
  it('retorna resultado vazio quando não há workspaces', async () => {
    const registry = createMockRegistry([])

    const result = await crossWorkspaceSearch(registry, {
      query: 'test',
      mergeStrategy: 'interleave',
    })

    expect(result.results).toEqual([])
    expect(result.errors).toEqual([])
    expect(result.stats.workspacesQueried).toBe(0)
    expect(result.stats.workspacesSucceeded).toBe(0)
  })

  it('filtra por workspaces específicos quando informado', async () => {
    const workspaces: WorkspaceInfo[] = [
      {
        id: 'ws1',
        name: 'WS1',
        path: '/tmp/ws1',
        indexDbPath: '/tmp/ws1.db',
        lastIndexed: '',
        isActive: true,
      },
      {
        id: 'ws2',
        name: 'WS2',
        path: '/tmp/ws2',
        indexDbPath: '/tmp/ws2.db',
        lastIndexed: '',
        isActive: true,
      },
    ]
    const registry = createMockRegistry(workspaces)

    const result = await crossWorkspaceSearch(registry, {
      query: 'test',
      workspaces: ['ws1'],
      mergeStrategy: 'interleave',
    })

    // Só ws1 foi consultado (e falhou porque DB não existe)
    expect(result.stats.workspacesQueried).toBe(1)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.workspaceId).toBe('ws1')
  })

  it('usa activeWorkspaces quando workspaces não informado', async () => {
    const workspaces: WorkspaceInfo[] = [
      {
        id: 'active1',
        name: 'Active1',
        path: '/tmp/active1',
        indexDbPath: '/tmp/active1.db',
        lastIndexed: '',
        isActive: true,
      },
      {
        id: 'inactive1',
        name: 'Inactive1',
        path: '/tmp/inactive1',
        indexDbPath: '/tmp/inactive1.db',
        lastIndexed: '',
        isActive: false,
      },
    ]
    const registry = createMockRegistry(workspaces)

    const result = await crossWorkspaceSearch(registry, {
      query: 'test',
      mergeStrategy: 'interleave',
    })

    // Só o ativo foi consultado
    expect(result.stats.workspacesQueried).toBe(1)
  })

  it('registra erros quando DB não existe', async () => {
    const workspaces: WorkspaceInfo[] = [
      {
        id: 'ws1',
        name: 'BadWS',
        path: '/tmp/bad-ws',
        indexDbPath: '/tmp/nonexistent.db',
        lastIndexed: '',
        isActive: true,
      },
    ]
    const registry = createMockRegistry(workspaces)

    const result = await crossWorkspaceSearch(registry, {
      query: 'test',
      mergeStrategy: 'interleave',
    })

    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]?.code).toBe('DB_ERROR')
    expect(result.stats.workspacesSucceeded).toBe(0)
  })

  it('respeita limite de resultados', async () => {
    const registry = createMockRegistry([])

    const result = await crossWorkspaceSearch(registry, {
      query: 'test',
      limit: 5,
      mergeStrategy: 'interleave',
    })

    expect(result.results.length).toBeLessThanOrEqual(5)
  })

  it('reporta totalDurationMs nas stats', async () => {
    const registry = createMockRegistry([])

    const result = await crossWorkspaceSearch(registry, {
      query: 'test',
      mergeStrategy: 'interleave',
    })

    expect(result.stats.totalDurationMs).toBeGreaterThanOrEqual(0)
  })
})
