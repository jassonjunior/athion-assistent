import { describe, expect, it, vi } from 'vitest'
import { createPermissionManager } from './permissions'
import type { DatabaseManager } from '../storage/db'

function makeMockDb(
  storedPermissions: Array<{
    action: string
    target: string | null
    decision: string
    scope: string
  }> = [],
): DatabaseManager {
  const permissions = [...storedPermissions]

  return {
    getPermission: vi.fn((action: string, target: string) => {
      return permissions.find(
        (p) => p.action === action && (p.target === target || p.target === '*'),
      )
    }),
    setPermission: vi.fn((p) => {
      permissions.push({ ...p, target: p.target ?? '*' })
    }),
    listPermissions: vi.fn(() => permissions),
  } as unknown as DatabaseManager
}

describe('createPermissionManager', () => {
  describe('check — sem regras', () => {
    it('retorna ask quando não há regras', () => {
      const pm = createPermissionManager(makeMockDb())
      const result = pm.check('read', '/src/index.ts')
      expect(result.decision).toBe('ask')
    })
  })

  describe('check — regras de sessão', () => {
    it('allow via regra de sessão', () => {
      const pm = createPermissionManager(makeMockDb())
      pm.grant({ action: 'read', target: '*', decision: 'allow', scope: 'session' })
      const result = pm.check('read', '/src/anything.ts')
      expect(result.decision).toBe('allow')
      expect(result.rule).toBeDefined()
    })

    it('deny via regra de sessão', () => {
      const pm = createPermissionManager(makeMockDb())
      pm.grant({ action: 'write', target: '/etc/**', decision: 'deny', scope: 'session' })
      const result = pm.check('write', '/etc/passwd')
      expect(result.decision).toBe('deny')
    })

    it('regras de sessão têm prioridade sobre persistidas', () => {
      const db = makeMockDb([
        { action: 'read', target: '/src/**', decision: 'deny', scope: 'remember' },
      ])
      const pm = createPermissionManager(db)
      pm.grant({ action: 'read', target: '/src/**', decision: 'allow', scope: 'session' })
      expect(pm.check('read', '/src/index.ts').decision).toBe('allow')
    })

    it('once scope adiciona regra de sessão', () => {
      const pm = createPermissionManager(makeMockDb())
      pm.grant({ action: 'bash', target: 'npm install', decision: 'allow', scope: 'once' })
      expect(pm.check('bash', 'npm install').decision).toBe('allow')
    })
  })

  describe('check — regras persistidas', () => {
    it('usa regras do banco (exact match) quando não há regra de sessão', () => {
      // DB só faz exact match ou *, não glob
      const db = makeMockDb([
        { action: 'read', target: '/home/user/file.txt', decision: 'allow', scope: 'remember' },
      ])
      const pm = createPermissionManager(db)
      const result = pm.check('read', '/home/user/file.txt')
      expect(result.decision).toBe('allow')
    })

    it('usa regras do banco com target * quando não há regra de sessão', () => {
      const db = makeMockDb([{ action: 'read', target: '*', decision: 'allow', scope: 'remember' }])
      const pm = createPermissionManager(db)
      const result = pm.check('read', '/any/path.ts')
      expect(result.decision).toBe('allow')
    })

    it('retorna ask quando nenhuma regra persistida bate', () => {
      const db = makeMockDb([
        { action: 'read', target: '/home/specific.ts', decision: 'allow', scope: 'remember' },
      ])
      const pm = createPermissionManager(db)
      const result = pm.check('write', '/tmp/file.txt')
      expect(result.decision).toBe('ask')
    })
  })

  describe('grant', () => {
    it('persiste regra remember no banco', () => {
      const db = makeMockDb()
      const pm = createPermissionManager(db)
      pm.grant({ action: 'write', target: '/tmp/**', decision: 'allow', scope: 'remember' })
      expect(db.setPermission).toHaveBeenCalledOnce()
    })

    it('não persiste regra session no banco', () => {
      const db = makeMockDb()
      const pm = createPermissionManager(db)
      pm.grant({ action: 'read', target: '*', decision: 'allow', scope: 'session' })
      expect(db.setPermission).not.toHaveBeenCalled()
    })
  })

  describe('clearSession', () => {
    it('remove todas as regras de sessão', () => {
      const pm = createPermissionManager(makeMockDb())
      pm.grant({ action: 'read', target: '*', decision: 'allow', scope: 'session' })
      pm.clearSession()
      expect(pm.check('read', '/anything').decision).toBe('ask')
    })

    it('não afeta regras persistidas', () => {
      const db = makeMockDb([{ action: 'read', target: '*', decision: 'allow', scope: 'remember' }])
      const pm = createPermissionManager(db)
      pm.clearSession()
      expect(pm.check('read', '/safe/file.txt').decision).toBe('allow')
    })
  })

  describe('listRules', () => {
    it('retorna regras de sessão + persistidas', () => {
      const db = makeMockDb([{ action: 'bash', target: '*', decision: 'deny', scope: 'remember' }])
      const pm = createPermissionManager(db)
      pm.grant({ action: 'read', target: '/src/**', decision: 'allow', scope: 'session' })
      const rules = pm.listRules()
      expect(rules).toHaveLength(2)
    })

    it('retorna array vazio quando não há regras', () => {
      const pm = createPermissionManager(makeMockDb())
      expect(pm.listRules()).toHaveLength(0)
    })
  })
})

describe('matchGlob (via check)', () => {
  it('* bate com qualquer string simples', () => {
    const pm = createPermissionManager(makeMockDb())
    pm.grant({ action: 'read', target: '*', decision: 'allow', scope: 'session' })
    expect(pm.check('read', 'anything').decision).toBe('allow')
  })

  it('/src/* bate com arquivo direto mas não subpasta', () => {
    const pm = createPermissionManager(makeMockDb())
    pm.grant({ action: 'read', target: '/src/*', decision: 'allow', scope: 'session' })
    expect(pm.check('read', '/src/index.ts').decision).toBe('allow')
    expect(pm.check('read', '/src/utils/helper.ts').decision).toBe('ask')
  })

  it('/src/** bate com qualquer profundidade', () => {
    const pm = createPermissionManager(makeMockDb())
    pm.grant({ action: 'read', target: '/src/**', decision: 'allow', scope: 'session' })
    expect(pm.check('read', '/src/a/b/c.ts').decision).toBe('allow')
  })
})
