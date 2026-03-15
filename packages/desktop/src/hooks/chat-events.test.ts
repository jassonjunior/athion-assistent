import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createChatEventHandler, flushAssistant, type ChatRefs } from './chat-events.js'
import type { ToolCallInfo } from './useChat.js'

function createRefs(): ChatRefs {
  return {
    content: { current: '' },
    toolCalls: { current: [] as ToolCallInfo[] },
    messageId: { current: 0 },
  }
}

describe('createChatEventHandler', () => {
  let refs: ChatRefs
  let setMessages: ReturnType<typeof vi.fn>
  let setIsStreaming: ReturnType<typeof vi.fn>

  beforeEach(() => {
    refs = createRefs()
    setMessages = vi.fn((updater) => {
      if (typeof updater === 'function') return updater([])
      return updater
    })
    setIsStreaming = vi.fn()
  })

  it('deve processar evento content — nova mensagem do assistente', () => {
    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    handler({ type: 'content', content: 'Olá' })

    expect(refs.content.current).toBe('Olá')
    expect(setMessages).toHaveBeenCalled()
  })

  it('deve acumular conteúdo em chamadas sucessivas de content', () => {
    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    handler({ type: 'content', content: 'Olá' })
    handler({ type: 'content', content: ' mundo' })

    expect(refs.content.current).toBe('Olá mundo')
  })

  it('deve processar evento content — atualizar última mensagem do assistente', () => {
    const existingMessages = [{ id: 'msg-1', role: 'assistant' as const, content: 'Olá' }]
    setMessages = vi.fn((updater) => {
      if (typeof updater === 'function') return updater(existingMessages)
      return updater
    })

    refs.content.current = 'Olá'
    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    handler({ type: 'content', content: ' mundo' })

    const updaterResult = setMessages.mock.results[0]?.value
    expect(updaterResult).toBeDefined()
    expect(updaterResult[0].content).toBe('Olá mundo')
  })

  it('deve processar evento tool_call', () => {
    // Primeiro cria uma mensagem de assistente
    const existingMessages = [{ id: 'msg-1', role: 'assistant' as const, content: 'pensando...' }]
    setMessages = vi.fn((updater) => {
      if (typeof updater === 'function') return updater(existingMessages)
      return updater
    })

    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    handler({ type: 'tool_call', id: 'tc-1', name: 'readFile', args: { path: '/a.ts' } })

    expect(refs.toolCalls.current).toHaveLength(1)
    expect(refs.toolCalls.current[0]).toEqual({
      id: 'tc-1',
      name: 'readFile',
      args: { path: '/a.ts' },
      status: 'running',
    })
  })

  it('deve processar evento tool_result com sucesso', () => {
    refs.toolCalls.current = [{ id: 'tc-1', name: 'readFile', args: {}, status: 'running' }]

    const existingMessages = [
      { id: 'msg-1', role: 'assistant' as const, content: '', toolCalls: refs.toolCalls.current },
    ]
    setMessages = vi.fn((updater) => {
      if (typeof updater === 'function') return updater(existingMessages)
      return updater
    })

    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    handler({ type: 'tool_result', id: 'tc-1', success: true, preview: 'file content' })

    expect(refs.toolCalls.current[0]?.status).toBe('success')
    expect(refs.toolCalls.current[0]?.result).toBe('file content')
  })

  it('deve processar evento tool_result com erro', () => {
    refs.toolCalls.current = [{ id: 'tc-1', name: 'readFile', args: {}, status: 'running' }]

    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    handler({ type: 'tool_result', id: 'tc-1', success: false, preview: 'not found' })

    expect(refs.toolCalls.current[0]?.status).toBe('error')
  })

  it('deve ignorar tool_result para id desconhecido', () => {
    refs.toolCalls.current = [{ id: 'tc-1', name: 'readFile', args: {}, status: 'running' }]

    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    handler({ type: 'tool_result', id: 'tc-unknown', success: true, preview: '' })

    expect(refs.toolCalls.current[0]?.status).toBe('running')
  })

  it('deve processar evento finish — flush e parar streaming', () => {
    refs.content.current = 'resposta completa'

    const existingMessages = [{ id: 'msg-1', role: 'assistant' as const, content: 'resposta' }]
    setMessages = vi.fn((updater) => {
      if (typeof updater === 'function') return updater(existingMessages)
      return updater
    })

    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    handler({ type: 'finish' })

    expect(setIsStreaming).toHaveBeenCalledWith(false)
    expect(refs.content.current).toBe('')
    expect(refs.toolCalls.current).toEqual([])
  })

  it('deve processar evento error — adicionar mensagem de erro', () => {
    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    handler({ type: 'error', message: 'algo deu errado' })

    expect(setMessages).toHaveBeenCalled()
    expect(setIsStreaming).toHaveBeenCalledWith(false)

    const updaterResult = setMessages.mock.results[0]?.value
    expect(updaterResult).toBeDefined()
    const errorMsg = updaterResult[updaterResult.length - 1]
    expect(errorMsg.content).toBe('Error: algo deu errado')
    expect(errorMsg.role).toBe('assistant')
  })

  it('deve ignorar eventos com tipo desconhecido', () => {
    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    handler({ type: 'unknown_type' })

    expect(setMessages).not.toHaveBeenCalled()
    expect(setIsStreaming).not.toHaveBeenCalled()
  })
})

describe('flushAssistant', () => {
  it('deve atualizar última mensagem do assistente com conteúdo acumulado', () => {
    const refs = createRefs()
    refs.content.current = 'conteúdo final'

    const existingMessages = [{ id: 'msg-1', role: 'assistant' as const, content: 'parcial' }]
    const setMessages = vi.fn((updater) => {
      if (typeof updater === 'function') return updater(existingMessages)
      return updater
    })

    flushAssistant(refs, setMessages)

    const result = setMessages.mock.results[0]?.value
    expect(result[0].content).toBe('conteúdo final')
    expect(refs.content.current).toBe('')
    expect(refs.toolCalls.current).toEqual([])
  })

  it('deve incluir toolCalls no flush quando existirem', () => {
    const refs = createRefs()
    refs.content.current = 'resposta'
    refs.toolCalls.current = [
      { id: 'tc-1', name: 'edit', args: {}, status: 'success', result: 'ok' },
    ]

    const existingMessages = [{ id: 'msg-1', role: 'assistant' as const, content: '' }]
    const setMessages = vi.fn((updater) => {
      if (typeof updater === 'function') return updater(existingMessages)
      return updater
    })

    flushAssistant(refs, setMessages)

    const result = setMessages.mock.results[0]?.value
    expect(result[0].toolCalls).toHaveLength(1)
    expect(result[0].toolCalls[0].name).toBe('edit')
  })

  it('não deve chamar setMessages quando não há conteúdo nem toolCalls', () => {
    const refs = createRefs()
    const setMessages = vi.fn()

    flushAssistant(refs, setMessages)

    expect(setMessages).not.toHaveBeenCalled()
  })

  it('não deve alterar mensagens se a última não for do assistente', () => {
    const refs = createRefs()
    refs.content.current = 'algo'

    const existingMessages = [{ id: 'msg-1', role: 'user' as const, content: 'pergunta' }]
    const setMessages = vi.fn((updater) => {
      if (typeof updater === 'function') return updater(existingMessages)
      return updater
    })

    flushAssistant(refs, setMessages)

    const result = setMessages.mock.results[0]?.value
    // Should return the same array since last is user, not assistant
    expect(result).toEqual(existingMessages)
  })
})
