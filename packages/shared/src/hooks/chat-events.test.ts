import { describe, it, expect, vi } from 'vitest'
import { createChatEventHandler, flushAssistant } from './chat-events.js'
import type { ChatRefs, ChatMessage } from './chat-events.js'
import type { MutableRefObject } from 'react'

function createMockRefs(): ChatRefs {
  return {
    content: { current: '' } as MutableRefObject<string>,
    toolCalls: { current: [] } as MutableRefObject<ChatRefs['toolCalls']['current']>,
    messageId: { current: 0 } as MutableRefObject<number>,
  }
}

describe('createChatEventHandler', () => {
  it('processa evento content sem throttle', () => {
    const refs = createMockRefs()
    const setMessages = vi.fn()
    const setIsStreaming = vi.fn()

    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    handler({ type: 'content', content: 'Hello' })

    expect(refs.content.current).toBe('Hello')
    expect(setMessages).toHaveBeenCalled()
  })

  it('acumula conteúdo de múltiplos eventos content', () => {
    const refs = createMockRefs()
    const setMessages = vi.fn()
    const setIsStreaming = vi.fn()

    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    handler({ type: 'content', content: 'Hello ' })
    handler({ type: 'content', content: 'World' })

    expect(refs.content.current).toBe('Hello World')
  })

  it('processa evento tool_call', () => {
    const refs = createMockRefs()
    // Simula já ter uma mensagem assistant
    const messages: ChatMessage[] = [{ id: 'msg-1', role: 'assistant', content: 'test' }]
    const setMessages = vi.fn((updater) => {
      if (typeof updater === 'function') {
        messages.splice(0, messages.length, ...(updater(messages) as ChatMessage[]))
      }
    })
    const setIsStreaming = vi.fn()

    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    handler({ type: 'tool_call', id: 'tc-1', name: 'search', args: { q: 'test' } })

    expect(refs.toolCalls.current).toHaveLength(1)
    expect(refs.toolCalls.current[0]?.name).toBe('search')
    expect(refs.toolCalls.current[0]?.status).toBe('running')
  })

  it('processa evento tool_result', () => {
    const refs = createMockRefs()
    refs.toolCalls.current = [{ id: 'tc-1', name: 'search', args: {}, status: 'running' }]
    const messages: ChatMessage[] = [{ id: 'msg-1', role: 'assistant', content: 'test' }]
    const setMessages = vi.fn((updater) => {
      if (typeof updater === 'function') {
        messages.splice(0, messages.length, ...(updater(messages) as ChatMessage[]))
      }
    })
    const setIsStreaming = vi.fn()

    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    handler({ type: 'tool_result', id: 'tc-1', success: true, preview: '3 results' })

    expect(refs.toolCalls.current[0]?.status).toBe('success')
    expect(refs.toolCalls.current[0]?.result).toBe('3 results')
  })

  it('processa evento finish — limpa refs e seta streaming=false', () => {
    const refs = createMockRefs()
    refs.content.current = 'Hello'
    const messages: ChatMessage[] = [{ id: 'msg-1', role: 'assistant', content: 'Hello' }]
    const setMessages = vi.fn((updater) => {
      if (typeof updater === 'function') {
        messages.splice(0, messages.length, ...(updater(messages) as ChatMessage[]))
      }
    })
    const setIsStreaming = vi.fn()

    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    handler({ type: 'finish' })

    expect(refs.content.current).toBe('')
    expect(refs.toolCalls.current).toHaveLength(0)
    expect(setIsStreaming).toHaveBeenCalledWith(false)
  })

  it('processa evento error — adiciona mensagem de erro', () => {
    const refs = createMockRefs()
    const messages: ChatMessage[] = []
    const setMessages = vi.fn((updater) => {
      if (typeof updater === 'function') {
        messages.splice(0, messages.length, ...(updater(messages) as ChatMessage[]))
      }
    })
    const setIsStreaming = vi.fn()

    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    handler({ type: 'error', message: 'Something failed' })

    expect(messages).toHaveLength(1)
    expect(messages[0]?.content).toBe('Error: Something failed')
    expect(setIsStreaming).toHaveBeenCalledWith(false)
  })
})

describe('flushAssistant', () => {
  it('limpa refs após flush', () => {
    const refs = createMockRefs()
    refs.content.current = 'test content'
    refs.toolCalls.current = [{ id: 'tc-1', name: 'tool', args: {}, status: 'success' }]

    const messages: ChatMessage[] = [{ id: 'msg-1', role: 'assistant', content: '' }]
    const setMessages = vi.fn((updater) => {
      if (typeof updater === 'function') {
        messages.splice(0, messages.length, ...(updater(messages) as ChatMessage[]))
      }
    })

    flushAssistant(refs, setMessages)

    expect(refs.content.current).toBe('')
    expect(refs.toolCalls.current).toHaveLength(0)
  })

  it('não chama setMessages se refs estão vazios', () => {
    const refs = createMockRefs()
    const setMessages = vi.fn()

    flushAssistant(refs, setMessages)

    expect(setMessages).not.toHaveBeenCalled()
  })
})
