/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unsafe-function-type */
/**
 * Testes unitários para serve/handlers.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createHandlers } from './handlers.js'

// ─── Mock do core ──────────────────────────────────────────────────

function createMockCore() {
  return {
    config: {
      get: vi.fn((key: string) => {
        const map: Record<string, unknown> = {
          model: 'gpt-4',
          provider: 'openai',
          theme: 'default',
        }
        return map[key] ?? null
      }),
      set: vi.fn(),
      getAll: vi.fn(() => ({ model: 'gpt-4', provider: 'openai' })),
    },
    orchestrator: {
      chat: vi.fn(function* () {
        yield { type: 'content', content: 'Olá' }
        yield { type: 'finish', usage: { promptTokens: 10, completionTokens: 5 } }
      }),
      createSession: vi.fn(async (projectId: string, title?: string) => ({
        id: 'session-123',
        projectId,
        title: title ?? 'Nova Sessão',
        createdAt: new Date().toISOString(),
      })),
      listSessions: vi.fn((projectId?: string) => [
        {
          id: 'session-1',
          projectId: projectId ?? 'proj',
          title: 'S1',
          createdAt: new Date().toISOString(),
        },
      ]),
      loadSession: vi.fn(async (id: string) => ({
        id,
        projectId: 'proj',
        title: 'Loaded',
        createdAt: new Date().toISOString(),
      })),
      deleteSession: vi.fn(),
    },
    tools: {
      list: vi.fn(() => [{ name: 'read_file', description: 'Lê um arquivo', level: 'safe' }]),
    },
    subagents: {
      list: vi.fn(() => [{ name: 'coder', description: 'Agente de código' }]),
    },
    skills: {
      list: vi.fn(() => [
        { name: 'ts-expert', description: 'TypeScript expert', triggers: ['ts'] },
      ]),
      get: vi.fn(),
      setActive: vi.fn(),
      clearActive: vi.fn(),
      getActive: vi.fn(() => null),
    },
    skillRegistry: {
      search: vi.fn(() => []),
      searchGitHub: vi.fn(async () => []),
      isInstalled: vi.fn(() => false),
      install: vi.fn(async () => ({ success: true })),
    },
    indexer: null as unknown,
    dependencyGraph: null as unknown,
    provider: {
      streamChat: vi.fn(function* () {
        yield { type: 'content', content: 'completed code' }
      }),
    },
    permissions: { grant: vi.fn() },
    bus: { subscribe: vi.fn() },
  }
}

describe('createHandlers', () => {
  let core: ReturnType<typeof createMockCore>
  let notify: ReturnType<typeof vi.fn>
  let handlers: ReturnType<typeof createHandlers>

  beforeEach(() => {
    core = createMockCore()
    notify = vi.fn()
    handlers = createHandlers(core as never, notify)
  })

  // ─── ping ────────────────────────────────────────────────────────

  describe('ping', () => {
    it('retorna pong: true com timestamp', async () => {
      const result = (await handlers['ping']!(undefined)) as { pong: boolean; timestamp: number }
      expect(result.pong).toBe(true)
      expect(result.timestamp).toBeTypeOf('number')
      expect(result.timestamp).toBeGreaterThan(0)
    })
  })

  // ─── session CRUD ────────────────────────────────────────────────

  describe('session.create', () => {
    it('cria sessão com projectId e title', async () => {
      const result = (await handlers['session.create']!({ projectId: 'p1', title: 'Test' })) as {
        id: string
      }
      expect(result.id).toBe('session-123')
      expect(core.orchestrator.createSession).toHaveBeenCalledWith('p1', 'Test')
    })
  })

  describe('session.list', () => {
    it('lista sessões com projectId', async () => {
      const result = (await handlers['session.list']!({ projectId: 'proj' })) as Array<{
        id: string
      }>
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBeGreaterThan(0)
    })

    it('lista sessões sem projectId', async () => {
      const result = (await handlers['session.list']!({})) as Array<{ id: string }>
      expect(Array.isArray(result)).toBe(true)
    })
  })

  describe('session.load', () => {
    it('carrega sessão pelo ID', async () => {
      const result = (await handlers['session.load']!({ sessionId: 'abc' })) as { id: string }
      expect(result.id).toBe('abc')
      expect(core.orchestrator.loadSession).toHaveBeenCalledWith('abc')
    })
  })

  describe('session.delete', () => {
    it('deleta sessão e retorna deleted: true', async () => {
      const result = (await handlers['session.delete']!({ sessionId: 'abc' })) as {
        deleted: boolean
      }
      expect(result.deleted).toBe(true)
      expect(core.orchestrator.deleteSession).toHaveBeenCalledWith('abc')
    })
  })

  // ─── config ──────────────────────────────────────────────────────

  describe('config.get', () => {
    it('retorna key e value', async () => {
      const result = (await handlers['config.get']!({ key: 'model' })) as {
        key: string
        value: unknown
      }
      expect(result.key).toBe('model')
      expect(result.value).toBe('gpt-4')
    })
  })

  describe('config.set', () => {
    it('define chave e retorna ok', async () => {
      const result = (await handlers['config.set']!({ key: 'model', value: 'gpt-3.5' })) as {
        ok: boolean
      }
      expect(result.ok).toBe(true)
      expect(core.config.set).toHaveBeenCalledWith('model', 'gpt-3.5')
    })
  })

  describe('config.list', () => {
    it('retorna todas as configurações', async () => {
      const result = (await handlers['config.list']!(undefined)) as Record<string, unknown>
      expect(result).toEqual({ model: 'gpt-4', provider: 'openai' })
    })
  })

  // ─── tools e agents ──────────────────────────────────────────────

  describe('tools.list', () => {
    it('retorna array de ferramentas', async () => {
      const result = (await handlers['tools.list']!(undefined)) as Array<{ name: string }>
      expect(Array.isArray(result)).toBe(true)
      expect(result[0]!.name).toBe('read_file')
    })
  })

  describe('agents.list', () => {
    it('retorna array de agentes', async () => {
      const result = (await handlers['agents.list']!(undefined)) as Array<{ name: string }>
      expect(Array.isArray(result)).toBe(true)
      expect(result[0]!.name).toBe('coder')
    })
  })

  // ─── chat.abort ──────────────────────────────────────────────────

  describe('chat.abort', () => {
    it('retorna aborted: false se sessão não existe', async () => {
      const result = (await handlers['chat.abort']!({ sessionId: 'inexistente' })) as {
        aborted: boolean
      }
      expect(result.aborted).toBe(false)
    })
  })

  // ─── codebase sem indexer ────────────────────────────────────────

  describe('codebase.index sem indexer', () => {
    it('lança erro se indexer não está configurado', async () => {
      await expect(handlers['codebase.index']!({})).rejects.toThrow('Indexer não configurado')
    })
  })

  describe('codebase.search sem indexer', () => {
    it('lança erro se indexer não está configurado', async () => {
      await expect(handlers['codebase.search']!({ query: 'test' })).rejects.toThrow(
        'Indexer não configurado',
      )
    })
  })

  describe('codebase.status sem indexer', () => {
    it('retorna available: false', async () => {
      const result = (await handlers['codebase.status']!(undefined)) as { available: boolean }
      expect(result.available).toBe(false)
    })
  })

  describe('codebase.clear sem indexer', () => {
    it('lança erro se indexer não está configurado', async () => {
      await expect(handlers['codebase.clear']!(undefined)).rejects.toThrow(
        'Indexer não configurado',
      )
    })
  })

  // ─── codebase com indexer ────────────────────────────────────────

  describe('codebase com indexer configurado', () => {
    beforeEach(() => {
      core.indexer = {
        indexWorkspace: vi.fn(async (cb?: Function) => {
          cb?.(1, 2, '/path/file.ts')
          return { totalFiles: 2, totalChunks: 10, hasVectors: true }
        }),
        indexFile: vi.fn(async () => {}),
        search: vi.fn(async () => [
          {
            chunk: {
              filePath: '/test.ts',
              startLine: 1,
              endLine: 10,
              language: 'typescript',
              symbolName: 'foo',
              chunkType: 'function',
              content: 'function foo() {}',
            },
            score: 0.95,
            source: 'bm25',
          },
        ]),
        getStats: vi.fn(() => ({
          totalFiles: 5,
          totalChunks: 20,
          hasVectors: true,
          workspacePath: '/workspace',
          indexedAt: new Date(),
        })),
        clear: vi.fn(),
      }
      handlers = createHandlers(core as never, notify)
    })

    it('codebase.index indexa workspace completo', async () => {
      const result = await handlers['codebase.index']!({})
      expect(result).toEqual({ totalFiles: 2, totalChunks: 10, hasVectors: true })
      expect(notify).toHaveBeenCalledWith(
        'codebase.event',
        expect.objectContaining({ type: 'progress' }),
      )
      expect(notify).toHaveBeenCalledWith(
        'codebase.event',
        expect.objectContaining({ type: 'done' }),
      )
    })

    it('codebase.index re-indexa arquivo específico', async () => {
      const result = (await handlers['codebase.index']!({ file: '/test.ts' })) as { ok: boolean }
      expect(result.ok).toBe(true)
      expect(core.indexer.indexFile).toHaveBeenCalledWith('/test.ts')
    })

    it('codebase.search retorna resultados', async () => {
      const result = (await handlers['codebase.search']!({ query: 'foo' })) as {
        results: unknown[]
      }
      expect(result.results.length).toBe(1)
    })

    it('codebase.status retorna estatísticas', async () => {
      const result = (await handlers['codebase.status']!(undefined)) as {
        available: boolean
        totalFiles: number
      }
      expect(result.available).toBe(true)
      expect(result.totalFiles).toBe(5)
    })

    it('codebase.clear limpa o índice', async () => {
      const result = (await handlers['codebase.clear']!(undefined)) as { ok: boolean }
      expect(result.ok).toBe(true)
      expect(core.indexer.clear).toHaveBeenCalled()
    })
  })

  // ─── dependency graph ────────────────────────────────────────────

  describe('codebase.getDependencyGraph', () => {
    it('retorna available: false quando não disponível', async () => {
      const result = (await handlers['codebase.getDependencyGraph']!({})) as { available: boolean }
      expect(result.available).toBe(false)
    })

    it('retorna grafo JSON quando disponível', async () => {
      core.dependencyGraph = {
        toJSON: vi.fn(() => ({ nodes: [], edges: [] })),
        toMermaid: vi.fn(() => 'graph TD'),
      }
      handlers = createHandlers(core as never, notify)

      const result = (await handlers['codebase.getDependencyGraph']!({})) as { graph: unknown }
      expect(result.graph).toEqual({ nodes: [], edges: [] })
    })

    it('retorna mermaid quando format=mermaid', async () => {
      core.dependencyGraph = {
        toJSON: vi.fn(),
        toMermaid: vi.fn(() => 'graph TD'),
      }
      handlers = createHandlers(core as never, notify)

      const result = (await handlers['codebase.getDependencyGraph']!({ format: 'mermaid' })) as {
        mermaid: string
      }
      expect(result.mermaid).toBe('graph TD')
    })

    it('retorna ambos quando format=both', async () => {
      core.dependencyGraph = {
        toJSON: vi.fn(() => ({ nodes: [] })),
        toMermaid: vi.fn(() => 'graph TD'),
      }
      handlers = createHandlers(core as never, notify)

      const result = (await handlers['codebase.getDependencyGraph']!({ format: 'both' })) as {
        graph: unknown
        mermaid: string
      }
      expect(result.graph).toBeDefined()
      expect(result.mermaid).toBe('graph TD')
    })
  })

  // ─── skill handlers ──────────────────────────────────────────────

  describe('skill.list', () => {
    it('retorna skills com name, description, triggers', async () => {
      const result = (await handlers['skill.list']!(undefined)) as Array<{ name: string }>
      expect(result[0]!.name).toBe('ts-expert')
    })
  })

  describe('skill.setActive', () => {
    it('ativa uma skill e retorna ok', async () => {
      const result = (await handlers['skill.setActive']!({ name: 'ts-expert' })) as { ok: boolean }
      expect(result.ok).toBe(true)
      expect(core.skills.setActive).toHaveBeenCalledWith('ts-expert')
    })
  })

  describe('skill.clearActive', () => {
    it('desativa skill ativa', async () => {
      const result = (await handlers['skill.clearActive']!(undefined)) as { ok: boolean }
      expect(result.ok).toBe(true)
      expect(core.skills.clearActive).toHaveBeenCalled()
    })
  })

  describe('skill.getActive', () => {
    it('retorna null quando nenhuma skill ativa', async () => {
      const result = await handlers['skill.getActive']!(undefined)
      expect(result).toBeNull()
    })

    it('retorna skill quando há uma ativa', async () => {
      core.skills.getActive = vi.fn(() => ({ name: 'ts-expert', description: 'TS' }))
      handlers = createHandlers(core as never, notify)
      const result = (await handlers['skill.getActive']!(undefined)) as { name: string }
      expect(result.name).toBe('ts-expert')
    })
  })

  // ─── plugin search/install ───────────────────────────────────────

  describe('plugin.search', () => {
    it('busca local sem query', async () => {
      await handlers['plugin.search']!({})
      expect(core.skillRegistry.search).toHaveBeenCalled()
    })

    it('busca no GitHub com query', async () => {
      await handlers['plugin.search']!({ query: 'react' })
      expect(core.skillRegistry.searchGitHub).toHaveBeenCalledWith('react')
    })
  })

  describe('plugin.install', () => {
    it('instala uma skill', async () => {
      const result = (await handlers['plugin.install']!({ name: 'my-skill' })) as {
        success: boolean
      }
      expect(result.success).toBe(true)
      expect(core.skillRegistry.install).toHaveBeenCalledWith('my-skill')
    })
  })
})
