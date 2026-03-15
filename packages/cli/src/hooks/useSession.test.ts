/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/**
 * Testes unitários para hooks/useSession.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks do React ────────────────────────────────────────────────

const stateMap = new Map<number, unknown>()
let stateCounter = 0

vi.mock('react', () => ({
  useState: (init: unknown) => {
    const idx = stateCounter++
    const val = typeof init === 'function' ? (init as () => unknown)() : init
    if (!stateMap.has(idx)) stateMap.set(idx, val)
    return [
      stateMap.get(idx),
      (v: unknown) =>
        stateMap.set(idx, typeof v === 'function' ? (v as Function)(stateMap.get(idx)) : v),
    ]
  },
  useCallback: (fn: Function) => fn,
}))

import { useSession } from './useSession.js'

function createMockCore() {
  return {
    orchestrator: {
      listSessions: vi.fn(() => [
        { id: 's1', projectId: 'cli', title: 'Session 1', createdAt: new Date().toISOString() },
        { id: 's2', projectId: 'cli', title: 'Session 2', createdAt: new Date().toISOString() },
      ]),
      createSession: vi.fn(async (projectId: string, title?: string) => ({
        id: 'new-session',
        projectId,
        title: title ?? 'New Session',
        createdAt: new Date().toISOString(),
      })),
      loadSession: vi.fn(async (id: string) => ({
        id,
        projectId: 'cli',
        title: 'Loaded Session',
        createdAt: new Date().toISOString(),
      })),
      deleteSession: vi.fn(),
    },
  }
}

const initialSession = {
  id: 'initial',
  projectId: 'cli',
  title: 'Initial',
  createdAt: new Date().toISOString(),
  messages: [],
}

describe('useSession', () => {
  let core: ReturnType<typeof createMockCore>

  beforeEach(() => {
    vi.clearAllMocks()
    stateMap.clear()
    stateCounter = 0
    core = createMockCore()
  })

  it('retorna o shape correto', () => {
    const result = useSession(core as never, initialSession as never)
    expect(result).toHaveProperty('session')
    expect(result).toHaveProperty('sessions')
    expect(result).toHaveProperty('isLoading')
    expect(result).toHaveProperty('createSession')
    expect(result).toHaveProperty('loadSession')
    expect(result).toHaveProperty('deleteSession')
    expect(result).toHaveProperty('switchSession')
  })

  it('session inicial é a passada como parâmetro', () => {
    const { session } = useSession(core as never, initialSession as never)
    expect(session.id).toBe('initial')
  })

  it('sessions é populada a partir do core.orchestrator.listSessions', () => {
    const { sessions } = useSession(core as never, initialSession as never)
    expect(sessions.length).toBe(2)
    expect(core.orchestrator.listSessions).toHaveBeenCalledWith('cli')
  })

  it('isLoading inicia como false', () => {
    const { isLoading } = useSession(core as never, initialSession as never)
    expect(isLoading).toBe(false)
  })

  it('createSession chama core.orchestrator.createSession', async () => {
    const { createSession } = useSession(core as never, initialSession as never)
    const newSession = await createSession('Minha Sessão')
    expect(core.orchestrator.createSession).toHaveBeenCalledWith('cli', 'Minha Sessão')
    expect(newSession.id).toBe('new-session')
  })

  it('loadSession chama core.orchestrator.loadSession', async () => {
    const { loadSession } = useSession(core as never, initialSession as never)
    const loaded = await loadSession('s1')
    expect(core.orchestrator.loadSession).toHaveBeenCalledWith('s1')
    expect(loaded.id).toBe('s1')
  })

  it('deleteSession chama core.orchestrator.deleteSession', () => {
    const { deleteSession } = useSession(core as never, initialSession as never)
    deleteSession('s1')
    expect(core.orchestrator.deleteSession).toHaveBeenCalledWith('s1')
  })

  it('deleteSession da sessão ativa cria nova sessão automaticamente', () => {
    const { deleteSession } = useSession(core as never, initialSession as never)
    deleteSession('initial')
    expect(core.orchestrator.deleteSession).toHaveBeenCalledWith('initial')
    expect(core.orchestrator.createSession).toHaveBeenCalledWith('cli')
  })

  it('switchSession chama loadSession internamente', async () => {
    const { switchSession } = useSession(core as never, initialSession as never)
    await switchSession('s2')
    expect(core.orchestrator.loadSession).toHaveBeenCalledWith('s2')
  })
})
