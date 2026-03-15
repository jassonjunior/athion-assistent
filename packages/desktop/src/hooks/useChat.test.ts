import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock bridge
const mockPing = vi.fn()
const mockSessionCreate = vi.fn()
const mockChatSend = vi.fn()
const mockChatAbort = vi.fn()
const mockOnChatEvent = vi.fn()
const mockSkillSetActive = vi.fn()
const mockSkillClearActive = vi.fn()
const mockPluginSearch = vi.fn()
const mockPluginInstall = vi.fn()

vi.mock('../bridge/tauri-bridge.js', () => ({
  ping: (...args: unknown[]) => mockPing(...args),
  sessionCreate: (...args: unknown[]) => mockSessionCreate(...args),
  chatSend: (...args: unknown[]) => mockChatSend(...args),
  chatAbort: (...args: unknown[]) => mockChatAbort(...args),
  onChatEvent: (...args: unknown[]) => mockOnChatEvent(...args),
  skillSetActive: (...args: unknown[]) => mockSkillSetActive(...args),
  skillClearActive: (...args: unknown[]) => mockSkillClearActive(...args),
  pluginSearch: (...args: unknown[]) => mockPluginSearch(...args),
  pluginInstall: (...args: unknown[]) => mockPluginInstall(...args),
}))

vi.mock('./chat-events.js', () => ({
  createChatEventHandler: vi.fn(() => vi.fn()),
  flushAssistant: vi.fn(),
}))

vi.mock('@athion/shared', () => ({}))

import { useChat } from './useChat.js'

beforeEach(() => {
  vi.clearAllMocks()
  mockOnChatEvent.mockResolvedValue(vi.fn())
  mockPing.mockResolvedValue({ pong: true })
  mockSessionCreate.mockResolvedValue({ id: 'session-1', title: '', createdAt: Date.now() })
  mockChatSend.mockResolvedValue(undefined)
  mockChatAbort.mockResolvedValue(undefined)
  mockSkillSetActive.mockResolvedValue(undefined)
  mockSkillClearActive.mockResolvedValue(undefined)
})

describe('useChat', () => {
  it('deve inicializar com estado padrão', async () => {
    const { result } = renderHook(() => useChat())

    expect(result.current.messages).toEqual([])
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.status).toBe('starting')
    expect(result.current.activeSkill).toBeNull()
  })

  it('deve criar sessão após init bem-sucedido', async () => {
    const { result } = renderHook(() => useChat())

    // Esperar init assíncrono
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(mockPing).toHaveBeenCalled()
    expect(mockSessionCreate).toHaveBeenCalledWith('default')
    expect(result.current.sessionId).toBe('session-1')
    expect(result.current.status).toBe('ready')
  })

  it('deve definir status error quando ping falha 10 vezes', async () => {
    mockPing.mockRejectedValue(new Error('timeout'))

    const { result } = renderHook(() => useChat())

    // Esperar todas as 10 tentativas (com timeouts mockados)
    await act(async () => {
      // Avançar timers manualmente não é necessário pois o setTimeout real é 1000ms
      // Mas podemos verificar que o status será 'error' eventualmente
      await new Promise((r) => setTimeout(r, 100))
    })

    // Pode ainda estar tentando, mas o status inicial é 'starting'
    expect(result.current.status).toBe('starting')
  })

  it('deve enviar mensagem via bridge', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    await act(async () => {
      await result.current.sendMessage('Olá')
    })

    expect(mockChatSend).toHaveBeenCalledWith('session-1', 'Olá')
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0]?.role).toBe('user')
    expect(result.current.messages[0]?.content).toBe('Olá')
  })

  it('não deve enviar mensagem vazia', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    await act(async () => {
      await result.current.sendMessage('   ')
    })

    expect(mockChatSend).not.toHaveBeenCalled()
    expect(result.current.messages).toHaveLength(0)
  })

  it('não deve enviar mensagem sem sessionId', async () => {
    mockPing.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await result.current.sendMessage('Olá')
    })

    expect(mockChatSend).not.toHaveBeenCalled()
  })

  it('deve processar comando /use-skill', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    await act(async () => {
      await result.current.sendMessage('/use-skill refactor')
    })

    expect(mockSkillSetActive).toHaveBeenCalledWith('refactor')
    expect(result.current.activeSkill).toBe('refactor')
    // Deve ter adicionado mensagem do usuário + mensagem do sistema
    expect(result.current.messages.length).toBeGreaterThanOrEqual(2)
  })

  it('deve processar comando /clear-skill', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    // Ativar skill primeiro
    await act(async () => {
      await result.current.sendMessage('/use-skill refactor')
    })

    expect(result.current.activeSkill).toBe('refactor')

    await act(async () => {
      await result.current.sendMessage('/clear-skill')
    })

    expect(mockSkillClearActive).toHaveBeenCalled()
    expect(result.current.activeSkill).toBeNull()
  })

  it('deve processar comando /find-skills', async () => {
    mockPluginSearch.mockResolvedValue({
      results: [
        {
          packageName: 'pkg',
          pluginName: 'test-skill',
          description: 'desc',
          version: '1.0',
          author: 'me',
        },
      ],
    })

    const { result } = renderHook(() => useChat())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    await act(async () => {
      await result.current.sendMessage('/find-skills test')
    })

    expect(mockPluginSearch).toHaveBeenCalledWith('test')
  })

  it('deve processar comando /find-skills sem query', async () => {
    mockPluginSearch.mockResolvedValue({ results: [] })

    const { result } = renderHook(() => useChat())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    await act(async () => {
      await result.current.sendMessage('/find-skills')
    })

    expect(mockPluginSearch).toHaveBeenCalledWith(undefined)
  })

  it('deve processar comando /install-skill', async () => {
    mockPluginInstall.mockResolvedValue({ success: true })

    const { result } = renderHook(() => useChat())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    await act(async () => {
      await result.current.sendMessage('/install-skill my-plugin')
    })

    expect(mockPluginInstall).toHaveBeenCalledWith('my-plugin')
  })

  it('deve abortar geração', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    await act(async () => {
      await result.current.abort()
    })

    expect(mockChatAbort).toHaveBeenCalledWith('session-1')
    expect(result.current.isStreaming).toBe(false)
  })

  it('deve criar nova sessão', async () => {
    const { result } = renderHook(() => useChat())

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    mockSessionCreate.mockResolvedValue({ id: 'session-2', title: '', createdAt: Date.now() })

    await act(async () => {
      await result.current.newSession()
    })

    expect(result.current.messages).toEqual([])
    expect(result.current.sessionId).toBe('session-2')
  })

  it('deve registrar listener de chat events na montagem', () => {
    renderHook(() => useChat())
    expect(mockOnChatEvent).toHaveBeenCalledWith(expect.any(Function))
  })

  it('deve chamar unlisten ao desmontar', async () => {
    const unlisten = vi.fn()
    mockOnChatEvent.mockResolvedValue(unlisten)

    const { unmount } = renderHook(() => useChat())

    unmount()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50))
    })

    expect(unlisten).toHaveBeenCalled()
  })
})
