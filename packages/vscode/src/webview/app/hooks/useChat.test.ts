/* eslint-disable @typescript-eslint/no-invalid-void-type */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock React hooks
const mockSetState = vi.fn()
const mockUseState = vi.fn((initial: unknown) => [initial, mockSetState])
const mockUseCallback = vi.fn((fn: unknown) => fn)
const mockUseEffect = vi.fn((fn: () => (() => void) | void) => {
  // Execute the effect immediately for testing
  fn()
})
const mockUseRef = vi.fn((initial: unknown) => ({ current: initial }))

vi.mock('react', () => ({
  useState: (...args: unknown[]) => mockUseState(...args),
  useCallback: (...args: unknown[]) => mockUseCallback(...args),
  useEffect: (...args: unknown[]) => mockUseEffect(...args),
  useRef: (...args: unknown[]) => mockUseRef(...args),
}))

const mockPost = vi.fn()
const mockOn = vi.fn()
vi.mock('./useMessenger.js', () => ({
  useMessenger: () => ({
    post: mockPost,
    on: mockOn,
    off: vi.fn(),
  }),
}))

const mockCreateChatEventHandler = vi.fn(() => vi.fn())
const mockFlushAssistant = vi.fn()
vi.mock('./chat-events.js', () => ({
  createChatEventHandler: (...args: unknown[]) => mockCreateChatEventHandler(...args),
  flushAssistant: (...args: unknown[]) => mockFlushAssistant(...args),
}))

vi.mock('@athion/shared', () => ({
  initI18n: vi.fn(),
}))

import { useChat } from './useChat.js'

describe('useChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    let stateIndex = 0
    const states = [
      [[], mockSetState], // messages
      [false, mockSetState], // isStreaming
      [null, mockSetState], // session
      ['starting', mockSetState], // status
      [null, mockSetState], // activeSkill
    ]
    mockUseState.mockImplementation(() => {
      const state = states[stateIndex % states.length]
      stateIndex++
      return state
    })
  })

  it('retorna estrutura correta com messages, isStreaming, session, status, activeSkill', () => {
    const result = useChat()

    expect(result).toHaveProperty('messages')
    expect(result).toHaveProperty('isStreaming')
    expect(result).toHaveProperty('session')
    expect(result).toHaveProperty('status')
    expect(result).toHaveProperty('activeSkill')
    expect(result).toHaveProperty('sendMessage')
    expect(result).toHaveProperty('clearMessages')
    expect(result).toHaveProperty('abort')
    expect(result).toHaveProperty('newSession')
  })

  it('envia tipo ready no useEffect', () => {
    useChat()

    expect(mockPost).toHaveBeenCalledWith({ type: 'ready' })
  })

  it('registra handlers de mensagens do messenger', () => {
    useChat()

    expect(mockOn).toHaveBeenCalledWith('locale:set', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('status:update', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('session:active', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('chat:event', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('chat:complete', expect.any(Function))
  })

  it('cria chat event handler', () => {
    useChat()

    expect(mockCreateChatEventHandler).toHaveBeenCalled()
  })

  describe('sendMessage', () => {
    it('nao envia mensagem vazia', () => {
      const { sendMessage } = useChat()

      sendMessage('   ')

      expect(mockPost).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'chat:send' }))
    })

    it('processa /clear limpando mensagens', () => {
      const { sendMessage } = useChat()

      sendMessage('/clear')

      expect(mockSetState).toHaveBeenCalledWith([])
    })

    it('processa /help adicionando mensagem de ajuda', () => {
      const { sendMessage } = useChat()

      sendMessage('/help')

      expect(mockSetState).toHaveBeenCalled()
    })

    it('processa /agents listando agentes', () => {
      const { sendMessage } = useChat()

      sendMessage('/agents')

      expect(mockPost).toHaveBeenCalledWith({ type: 'agents:list' })
    })

    it('processa /skills listando skills', () => {
      const { sendMessage } = useChat()

      sendMessage('/skills')

      expect(mockPost).toHaveBeenCalledWith({ type: 'skill:list' })
    })

    it('processa /model solicitando config', () => {
      const { sendMessage } = useChat()

      sendMessage('/model')

      expect(mockPost).toHaveBeenCalledWith({ type: 'config:list' })
    })

    it('processa /codebase-index iniciando indexacao', () => {
      const { sendMessage } = useChat()

      sendMessage('/codebase-index')

      expect(mockPost).toHaveBeenCalledWith({ type: 'codebase:index' })
    })

    it('processa /codebase-search com query', () => {
      const { sendMessage } = useChat()

      sendMessage('/codebase-search auth function')

      expect(mockPost).toHaveBeenCalledWith({ type: 'codebase:search', query: 'auth function' })
    })

    it('processa /use-skill ativando skill', () => {
      const { sendMessage } = useChat()

      sendMessage('/use-skill my-skill')

      expect(mockPost).toHaveBeenCalledWith({ type: 'skill:setActive', name: 'my-skill' })
    })

    it('processa /clear-skill desativando skill', () => {
      const { sendMessage } = useChat()

      sendMessage('/clear-skill')

      expect(mockPost).toHaveBeenCalledWith({ type: 'skill:clearActive' })
    })

    it('processa /find-skills buscando skills', () => {
      const { sendMessage } = useChat()

      sendMessage('/find-skills testing')

      expect(mockPost).toHaveBeenCalledWith({ type: 'skills:find', query: 'testing' })
    })

    it('processa /install-skill instalando skill', () => {
      const { sendMessage } = useChat()

      sendMessage('/install-skill my-plugin')

      expect(mockPost).toHaveBeenCalledWith({ type: 'skills:install', name: 'my-plugin' })
    })

    it('processa /codebase sem argumento como index', () => {
      const { sendMessage } = useChat()

      sendMessage('/codebase')

      expect(mockPost).toHaveBeenCalledWith({ type: 'codebase:index' })
    })

    it('processa /codebase com argumento como search', () => {
      const { sendMessage } = useChat()

      sendMessage('/codebase auth handler')

      expect(mockPost).toHaveBeenCalledWith({ type: 'codebase:search', query: 'auth handler' })
    })

    it('envia mensagem normal ao chat quando nao e comando', () => {
      const { sendMessage } = useChat()

      sendMessage('hello world')

      expect(mockPost).toHaveBeenCalledWith({ type: 'chat:send', content: 'hello world' })
    })
  })

  describe('clearMessages', () => {
    it('limpa mensagens', () => {
      const { clearMessages } = useChat()

      clearMessages()

      expect(mockSetState).toHaveBeenCalledWith([])
    })
  })

  describe('abort', () => {
    it('envia chat:abort e para streaming', () => {
      const { abort } = useChat()

      abort()

      expect(mockPost).toHaveBeenCalledWith({ type: 'chat:abort' })
    })
  })

  describe('newSession', () => {
    it('limpa mensagens e cria nova sessao', () => {
      const { newSession } = useChat()

      newSession()

      expect(mockPost).toHaveBeenCalledWith({ type: 'session:create' })
    })
  })
})
