import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { createDatabaseManager } from './db'
import type { DatabaseManager } from './db'

const PARTS_TEXT = [{ type: 'text', text: 'Olá' }]

let db: DatabaseManager

beforeEach(() => {
  // :memory: garante isolamento total entre testes
  db = createDatabaseManager(':memory:')
})

afterEach(() => {
  db.close()
})

describe('createDatabaseManager — Sessions', () => {
  it('cria uma sessão com id, projectId e timestamps', () => {
    const session = db.createSession('proj-1', 'Teste')
    expect(session.id).toBeDefined()
    expect(session.projectId).toBe('proj-1')
    expect(session.title).toBe('Teste')
    expect(session.createdAt).toBeInstanceOf(Date)
  })

  it('cria sessão sem título (null)', () => {
    const session = db.createSession('proj-1')
    expect(session.title).toBeNull()
  })

  it('getSession retorna sessão existente', () => {
    const created = db.createSession('proj-1', 'Minha sessão')
    const found = db.getSession(created.id)
    expect(found).toBeDefined()
    expect(found?.id).toBe(created.id)
    expect(found?.title).toBe('Minha sessão')
  })

  it('getSession retorna undefined para ID inexistente', () => {
    expect(db.getSession('nao-existe')).toBeUndefined()
  })

  it('listSessions retorna todas as sessões', () => {
    db.createSession('proj-1', 'S1')
    db.createSession('proj-1', 'S2')
    db.createSession('proj-2', 'S3')
    expect(db.listSessions()).toHaveLength(3)
  })

  it('listSessions filtra por projectId', () => {
    db.createSession('proj-1', 'S1')
    db.createSession('proj-1', 'S2')
    db.createSession('proj-2', 'S3')
    const proj1 = db.listSessions('proj-1')
    expect(proj1).toHaveLength(2)
    expect(proj1.every((s) => s.projectId === 'proj-1')).toBe(true)
  })

  it('updateSession altera o título', () => {
    const session = db.createSession('proj-1', 'Original')
    db.updateSession(session.id, { title: 'Atualizado' })
    const updated = db.getSession(session.id)
    expect(updated?.title).toBe('Atualizado')
  })

  it('deleteSession remove a sessão', () => {
    const session = db.createSession('proj-1', 'Para deletar')
    db.deleteSession(session.id)
    expect(db.getSession(session.id)).toBeUndefined()
  })

  it('deleteSession remove mensagens em cascade', () => {
    const session = db.createSession('proj-1')
    db.addMessage(session.id, { role: 'user', parts: PARTS_TEXT })
    db.deleteSession(session.id)
    expect(db.getSession(session.id)).toBeUndefined()
  })
})

describe('createDatabaseManager — Messages', () => {
  it('addMessage adiciona mensagem com id, role e sessionId', () => {
    const session = db.createSession('proj-1')
    const msg = db.addMessage(session.id, { role: 'user', parts: PARTS_TEXT })
    expect(msg.id).toBeDefined()
    expect(msg.role).toBe('user')
    expect(msg.sessionId).toBe(session.id)
    expect(msg.createdAt).toBeInstanceOf(Date)
  })

  it('getMessages retorna mensagens em ordem de criação', () => {
    const session = db.createSession('proj-1')
    db.addMessage(session.id, { role: 'user', parts: [{ type: 'text', text: 'M1' }] })
    db.addMessage(session.id, { role: 'assistant', parts: [{ type: 'text', text: 'M2' }] })
    const msgs = db.getMessages(session.id)
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('user')
    expect(msgs[1].role).toBe('assistant')
  })

  it('getMessages retorna array vazio para sessão sem mensagens', () => {
    const session = db.createSession('proj-1')
    expect(db.getMessages(session.id)).toEqual([])
  })

  it('deleteMessages remove mensagens sem deletar a sessão', () => {
    const session = db.createSession('proj-1')
    db.addMessage(session.id, { role: 'user', parts: PARTS_TEXT })
    db.deleteMessages(session.id)
    expect(db.getMessages(session.id)).toHaveLength(0)
    expect(db.getSession(session.id)).toBeDefined()
  })

  it('mensagens de sessões diferentes ficam isoladas', () => {
    const s1 = db.createSession('proj-1')
    const s2 = db.createSession('proj-1')
    db.addMessage(s1.id, { role: 'user', parts: PARTS_TEXT })
    expect(db.getMessages(s2.id)).toHaveLength(0)
  })

  it('addMessage aceita role assistant', () => {
    const session = db.createSession('proj-1')
    const msg = db.addMessage(session.id, {
      role: 'assistant',
      parts: [{ type: 'text', text: 'Resposta' }],
    })
    expect(msg.role).toBe('assistant')
  })
})

describe('createDatabaseManager — Permissions', () => {
  it('setPermission persiste permissão allow', () => {
    db.setPermission({ action: 'read', target: '/src/**', decision: 'allow', scope: 'remember' })
    const perm = db.getPermission('read', '/src/**')
    expect(perm).toBeDefined()
    expect(perm?.decision).toBe('allow')
  })

  it('setPermission persiste permissão deny', () => {
    db.setPermission({ action: 'bash', target: 'rm -rf', decision: 'deny', scope: 'remember' })
    const perm = db.getPermission('bash', 'rm -rf')
    expect(perm?.decision).toBe('deny')
  })

  it('getPermission retorna undefined para permissão inexistente', () => {
    expect(db.getPermission('write', '/etc/passwd')).toBeUndefined()
  })

  it('getPermission encontra via target wildcard *', () => {
    db.setPermission({ action: 'read', target: '*', decision: 'allow', scope: 'remember' })
    const perm = db.getPermission('read', 'any-target')
    expect(perm).toBeDefined()
  })

  it('listPermissions retorna todas as permissões', () => {
    db.setPermission({ action: 'read', target: '*', decision: 'allow', scope: 'remember' })
    db.setPermission({ action: 'bash', target: 'rm -rf', decision: 'deny', scope: 'remember' })
    expect(db.listPermissions()).toHaveLength(2)
  })

  it('listPermissions retorna array vazio quando não há permissões', () => {
    expect(db.listPermissions()).toHaveLength(0)
  })

  it('deletePermission remove a permissão', () => {
    db.setPermission({ action: 'read', target: '*', decision: 'allow', scope: 'remember' })
    const perms = db.listPermissions()
    expect(perms).toHaveLength(1)
    db.deletePermission(perms[0].id)
    expect(db.listPermissions()).toHaveLength(0)
  })
})
