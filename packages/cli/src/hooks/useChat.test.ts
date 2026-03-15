/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/**
 * Testes unitários para hooks/useChat.ts
 *
 * Testa as funções puras exportadas (resolveAtMentions, systemMsg) e
 * o fluxo do hook useChat via mocks do React e do core.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ─────────────────────────────────────────────────────────

// Mock do fs para resolveAtMentions
vi.mock('node:fs', () => ({
  readFileSync: vi.fn((path: string) => {
    if (path.includes('exists.ts')) return 'const x = 1;\nconst y = 2;'
    if (path.includes('big.ts')) return Array(250).fill('line').join('\n')
    throw new Error('ENOENT')
  }),
  existsSync: vi.fn((path: string) => {
    return path.includes('exists.ts') || path.includes('big.ts')
  }),
}))

// Mock do React hooks
const mockSetState = vi.fn()
const mockUseState = vi.fn((init: unknown) => {
  const val = typeof init === 'function' ? (init as () => unknown)() : init
  return [val, mockSetState]
})
const mockUseCallback = vi.fn((fn: Function) => fn)
const mockUseRef = vi.fn((val: unknown) => ({ current: val }))

vi.mock('react', () => ({
  useState: (...args: unknown[]) => mockUseState(...args),
  useCallback: (...args: unknown[]) => mockUseCallback(...args),
  useRef: (...args: unknown[]) => mockUseRef(...args),
}))

// Importa após mocks
import { useChat } from './useChat.js'

function createMockCore() {
  return {
    config: {
      get: vi.fn((key: string) => {
        if (key === 'model') return 'gpt-4'
        if (key === 'provider') return 'openai'
        return null
      }),
    },
    orchestrator: {
      chat: vi.fn(function () {
        return (async function* () {
          yield { type: 'content', content: 'Hello' }
          yield {
            type: 'finish',
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          }
        })()
      }),
    },
    subagents: {
      list: vi.fn(() => [{ name: 'coder', description: 'Coder agent' }]),
    },
    skills: {
      list: vi.fn(() => [{ name: 'ts', description: 'TS skill' }]),
      get: vi.fn((name: string) =>
        name === 'ts' ? { name: 'ts', description: 'TS skill' } : null,
      ),
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
  }
}

describe('useChat', () => {
  let core: ReturnType<typeof createMockCore>

  beforeEach(() => {
    vi.clearAllMocks()
    core = createMockCore()
  })

  it('retorna o shape correto de UseChatReturn', () => {
    const result = useChat(core as never, 'session-1')

    expect(result).toHaveProperty('messages')
    expect(result).toHaveProperty('isStreaming')
    expect(result).toHaveProperty('streamingContent')
    expect(result).toHaveProperty('currentTool')
    expect(result).toHaveProperty('currentAgent')
    expect(result).toHaveProperty('tokens')
    expect(result).toHaveProperty('sendMessage')
    expect(result).toHaveProperty('abort')
    expect(result).toHaveProperty('clearMessages')
    expect(result).toHaveProperty('addMessage')
    expect(result).toHaveProperty('skillsMenuOpen')
    expect(result).toHaveProperty('setSkillsMenuOpen')
  })

  it('sendMessage é uma função', () => {
    const { sendMessage } = useChat(core as never, 'session-1')
    expect(typeof sendMessage).toBe('function')
  })

  it('abort é uma função', () => {
    const { abort } = useChat(core as never, 'session-1')
    expect(typeof abort).toBe('function')
  })

  it('clearMessages é uma função', () => {
    const { clearMessages } = useChat(core as never, 'session-1')
    expect(typeof clearMessages).toBe('function')
  })

  it('addMessage é uma função', () => {
    const { addMessage } = useChat(core as never, 'session-1')
    expect(typeof addMessage).toBe('function')
  })

  describe('slash commands', () => {
    it('/clear chama clearMessages', async () => {
      const { sendMessage } = useChat(core as never, 'session-1')
      await sendMessage('/clear')
      // /clear intercepta localmente, não chama orchestrator
      expect(core.orchestrator.chat).not.toHaveBeenCalled()
    })

    it('/help não chama orchestrator', async () => {
      const { sendMessage } = useChat(core as never, 'session-1')
      await sendMessage('/help')
      expect(core.orchestrator.chat).not.toHaveBeenCalled()
    })

    it('/agents não chama orchestrator', async () => {
      const { sendMessage } = useChat(core as never, 'session-1')
      await sendMessage('/agents')
      expect(core.orchestrator.chat).not.toHaveBeenCalled()
    })

    it('/model não chama orchestrator', async () => {
      const { sendMessage } = useChat(core as never, 'session-1')
      await sendMessage('/model')
      expect(core.orchestrator.chat).not.toHaveBeenCalled()
    })

    it('/skills não chama orchestrator', async () => {
      const { sendMessage } = useChat(core as never, 'session-1')
      await sendMessage('/skills')
      expect(core.orchestrator.chat).not.toHaveBeenCalled()
    })

    it('/codebase-index sem indexer não chama orchestrator', async () => {
      const { sendMessage } = useChat(core as never, 'session-1')
      await sendMessage('/codebase-index')
      expect(core.orchestrator.chat).not.toHaveBeenCalled()
    })

    it('/codebase-search sem indexer não chama orchestrator', async () => {
      const { sendMessage } = useChat(core as never, 'session-1')
      await sendMessage('/codebase-search query')
      expect(core.orchestrator.chat).not.toHaveBeenCalled()
    })

    it('/codebase-search sem query não chama orchestrator', async () => {
      core.indexer = { search: vi.fn(), indexWorkspace: vi.fn() }
      const { sendMessage } = useChat(core as never, 'session-1')
      await sendMessage('/codebase-search')
      expect(core.orchestrator.chat).not.toHaveBeenCalled()
    })

    it('/use-skill sem argumento lista skills disponíveis', async () => {
      const { sendMessage } = useChat(core as never, 'session-1')
      await sendMessage('/use-skill')
      expect(core.orchestrator.chat).not.toHaveBeenCalled()
    })

    it('/use-skill com nome válido ativa skill', async () => {
      const { sendMessage } = useChat(core as never, 'session-1')
      await sendMessage('/use-skill ts')
      expect(core.skills.setActive).toHaveBeenCalledWith('ts')
    })

    it('/use-skill com nome inválido não ativa', async () => {
      const { sendMessage } = useChat(core as never, 'session-1')
      await sendMessage('/use-skill nao-existe')
      expect(core.skills.setActive).not.toHaveBeenCalled()
    })

    it('/clear-skill desativa skill ativa', async () => {
      const { sendMessage } = useChat(core as never, 'session-1')
      await sendMessage('/clear-skill')
      expect(core.skills.clearActive).toHaveBeenCalled()
    })

    it('/find-skills sem query busca local', async () => {
      const { sendMessage } = useChat(core as never, 'session-1')
      await sendMessage('/find-skills')
      expect(core.skillRegistry.search).toHaveBeenCalled()
    })

    it('/install-skill sem argumento não instala', async () => {
      const { sendMessage } = useChat(core as never, 'session-1')
      await sendMessage('/install-skill')
      expect(core.skillRegistry.install).not.toHaveBeenCalled()
    })

    it('comando desconhecido /xyz não é interceptado e vai para orchestrator', async () => {
      const { sendMessage } = useChat(core as never, 'session-1')
      await sendMessage('/xyz')
      expect(core.orchestrator.chat).toHaveBeenCalled()
    })

    it('mensagem normal (sem /) vai para orchestrator', async () => {
      const { sendMessage } = useChat(core as never, 'session-1')
      await sendMessage('olá mundo')
      expect(core.orchestrator.chat).toHaveBeenCalled()
    })
  })
})
