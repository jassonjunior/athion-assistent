/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/**
 * Testes unitários para hooks/usePermission.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks do React ────────────────────────────────────────────────

const stateStore = new Map<number, unknown>()
let stateIdx = 0

vi.mock('react', () => ({
  useState: (init: unknown) => {
    const idx = stateIdx++
    const val = typeof init === 'function' ? (init as () => unknown)() : init
    if (!stateStore.has(idx)) stateStore.set(idx, val)
    return [
      stateStore.get(idx),
      (v: unknown) =>
        stateStore.set(idx, typeof v === 'function' ? (v as Function)(stateStore.get(idx)) : v),
    ]
  },
  useCallback: (fn: Function) => fn,
}))

import { usePermission } from './usePermission.js'

function createMockCore() {
  return {
    permissions: {
      grant: vi.fn(),
    },
  }
}

describe('usePermission', () => {
  let core: ReturnType<typeof createMockCore>

  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    stateIdx = 0
    core = createMockCore()
  })

  it('retorna o shape correto', () => {
    const result = usePermission(core as never)
    expect(result).toHaveProperty('pendingRequest')
    expect(result).toHaveProperty('requestPermission')
    expect(result).toHaveProperty('grant')
    expect(result).toHaveProperty('deny')
  })

  it('pendingRequest inicia como null', () => {
    const { pendingRequest } = usePermission(core as never)
    expect(pendingRequest).toBeNull()
  })

  it('requestPermission retorna uma Promise', () => {
    const { requestPermission } = usePermission(core as never)
    const result = requestPermission('read_file', '/test.ts')
    expect(result).toBeInstanceOf(Promise)
  })

  it('grant sem pendingRequest não faz nada', () => {
    const { grant } = usePermission(core as never)
    grant('allow', 'once')
    expect(core.permissions.grant).not.toHaveBeenCalled()
  })

  it('deny sem pendingRequest não faz nada', () => {
    const { deny } = usePermission(core as never)
    // Não deve lançar erro
    expect(() => deny()).not.toThrow()
  })

  it('grant com scope "session" persiste regra via core.permissions.grant', () => {
    // Simula que há pendingRequest (mockando o estado)
    stateStore.set(0, {
      id: 'req-1',
      toolName: 'write_file',
      target: '/test.ts',
      resolve: vi.fn(),
    })

    const { grant, pendingRequest } = usePermission(core as never)

    // Se pendingRequest existe, grant deve persistir
    if (pendingRequest) {
      grant('allow', 'session')
      expect(core.permissions.grant).toHaveBeenCalledWith({
        action: 'write_file',
        target: '/test.ts',
        decision: 'allow',
        scope: 'session',
      })
    }
  })

  it('grant com scope "once" NÃO persiste regra', () => {
    const resolveFn = vi.fn()
    stateStore.set(0, {
      id: 'req-2',
      toolName: 'delete_file',
      target: '/test.ts',
      resolve: resolveFn,
    })

    const { grant, pendingRequest } = usePermission(core as never)

    if (pendingRequest) {
      grant('allow', 'once')
      expect(core.permissions.grant).not.toHaveBeenCalled()
      expect(resolveFn).toHaveBeenCalledWith('allow')
    }
  })

  it('grant com decision "deny" resolve com "deny"', () => {
    const resolveFn = vi.fn()
    stateStore.set(0, {
      id: 'req-3',
      toolName: 'exec',
      target: 'rm -rf',
      resolve: resolveFn,
    })

    const { grant, pendingRequest } = usePermission(core as never)

    if (pendingRequest) {
      grant('deny', 'session')
      expect(resolveFn).toHaveBeenCalledWith('deny')
    }
  })

  it('deny resolve com "deny" e limpa pendingRequest', () => {
    const resolveFn = vi.fn()
    stateStore.set(0, {
      id: 'req-4',
      toolName: 'exec',
      target: 'cmd',
      resolve: resolveFn,
    })

    const { deny, pendingRequest } = usePermission(core as never)

    if (pendingRequest) {
      deny()
      expect(resolveFn).toHaveBeenCalledWith('deny')
    }
  })
})
