/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createSessionManager } from './session'
import type { DatabaseManager } from '../storage/db'
import type { TokenManager } from '../tokens/types'

function makeDb(): DatabaseManager {
  const sessions = new Map<
    string,
    { id: string; projectId: string; title: string | null; createdAt: Date; updatedAt: Date }
  >()
  const messages = new Map<string, Array<{ role: string; parts: unknown }>>()

  return {
    createSession: vi.fn((projectId: string, title?: string) => {
      const session = {
        id: 'session-' + Math.random().toString(36).slice(2),
        projectId,
        title: title ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      sessions.set(session.id, session)
      messages.set(session.id, [])
      return session
    }),
    getSession: vi.fn((id: string) => sessions.get(id) ?? null),
    listSessions: vi.fn((projectId?: string) => {
      const all = [...sessions.values()]
      return projectId ? all.filter((s) => s.projectId === projectId) : all
    }),
    deleteSession: vi.fn((id: string) => {
      sessions.delete(id)
      messages.delete(id)
    }),
    getMessages: vi.fn((id: string) => messages.get(id) ?? []),
    addMessage: vi.fn((id: string, msg: { role: string; parts: unknown }) => {
      if (!messages.has(id)) messages.set(id, [])
      messages.get(id)!.push(msg)
    }),
    deleteMessages: vi.fn((id: string) => {
      messages.set(id, [])
    }),
  } as unknown as DatabaseManager
}

function makeTokens(): TokenManager {
  return {
    compact: vi.fn((messages: Array<{ role: string; content: string }>) =>
      Promise.resolve(messages),
    ),
    count: vi.fn(() => 0),
  } as unknown as TokenManager
}

describe('createSessionManager', () => {
  let db: DatabaseManager
  let tokens: TokenManager

  beforeEach(() => {
    db = makeDb()
    tokens = makeTokens()
  })

  describe('create', () => {
    it('cria sessão com projectId', () => {
      const sm = createSessionManager(db, tokens)
      const session = sm.create('project-1')

      expect(session.id).toBeTruthy()
      expect(session.projectId).toBe('project-1')
      expect(session.createdAt).toBeInstanceOf(Date)
    })

    it('cria sessão com título', () => {
      const sm = createSessionManager(db, tokens)
      const session = sm.create('project-1', 'My Session')

      expect(session.title).toBe('My Session')
    })

    it('converte title null para string vazia', () => {
      const sm = createSessionManager(db, tokens)
      const session = sm.create('project-1')

      expect(session.title).toBe('')
    })
  })

  describe('load', () => {
    it('carrega sessão existente', () => {
      const sm = createSessionManager(db, tokens)
      const created = sm.create('project-1', 'Test')

      const loaded = sm.load(created.id)
      expect(loaded.id).toBe(created.id)
    })

    it('lança erro para sessão inexistente', () => {
      const sm = createSessionManager(db, tokens)
      expect(() => sm.load('nonexistent')).toThrow('not found')
    })
  })

  describe('list', () => {
    it('lista todas as sessões', () => {
      const sm = createSessionManager(db, tokens)
      sm.create('p1')
      sm.create('p2')

      const all = sm.list()
      expect(all).toHaveLength(2)
    })

    it('filtra por projectId', () => {
      const sm = createSessionManager(db, tokens)
      sm.create('p1')
      sm.create('p2')

      const filtered = sm.list('p1')
      expect(filtered).toHaveLength(1)
      expect(filtered[0].projectId).toBe('p1')
    })
  })

  describe('delete', () => {
    it('deleta sessão pelo ID', () => {
      const sm = createSessionManager(db, tokens)
      const session = sm.create('p1')

      sm.delete(session.id)

      expect(db.deleteSession).toHaveBeenCalledWith(session.id)
    })
  })

  describe('addMessage / getMessages', () => {
    it('adiciona e recupera mensagens', () => {
      const sm = createSessionManager(db, tokens)
      const session = sm.create('p1')

      sm.addMessage(session.id, 'user', 'Hello')
      sm.addMessage(session.id, 'assistant', 'Hi there!')

      const msgs = sm.getMessages(session.id)
      expect(msgs).toHaveLength(2)
      expect(msgs[0].role).toBe('user')
      expect(msgs[0].content).toBe('Hello')
    })

    it('converte parts para content no getMessages', () => {
      const sm = createSessionManager(db, tokens)
      const session = sm.create('p1')

      sm.addMessage(session.id, 'user', 'Test message')

      // getMessages converte parts → content
      const msgs = sm.getMessages(session.id)
      expect(msgs[0]).toHaveProperty('role')
      expect(msgs[0]).toHaveProperty('content')
    })
  })

  describe('compress', () => {
    it('chama tokens.compact e reescreve mensagens', async () => {
      const sm = createSessionManager(db, tokens)
      const session = sm.create('p1')

      sm.addMessage(session.id, 'user', 'Hello')
      sm.addMessage(session.id, 'assistant', 'Hi')

      await sm.compress(session.id)

      expect(tokens.compact).toHaveBeenCalled()
      expect(db.deleteMessages).toHaveBeenCalledWith(session.id)
    })
  })
})
