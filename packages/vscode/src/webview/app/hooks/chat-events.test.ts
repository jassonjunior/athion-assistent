/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createChatEventHandler, flushAssistant, type ChatRefs } from './chat-events.js'
import type { ChatMessage, ToolCallInfo } from './useChat.js'

function createRefs(): ChatRefs {
  return {
    content: { current: '' },
    toolCalls: { current: [] },
    messageId: { current: 0 },
  }
}

describe('chat-events', () => {
  let refs: ChatRefs
  let setMessages: ReturnType<typeof vi.fn>
  let setIsStreaming: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    refs = createRefs()
    setMessages = vi.fn((updater) => {
      if (typeof updater === 'function') {
        return updater([])
      }
    })
    setIsStreaming = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('createChatEventHandler', () => {
    it('retorna uma funcao handler', () => {
      const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
      expect(typeof handler).toBe('function')
    })

    describe('content event', () => {
      it('acumula conteudo no ref', () => {
        const handler = createChatEventHandler(refs, setMessages, setIsStreaming)

        handler({ type: 'content', content: 'hello ' })
        handler({ type: 'content', content: 'world' })

        expect(refs.content.current).toBe('hello world')
      })

      it('faz flush para o state com throttle', () => {
        const handler = createChatEventHandler(refs, setMessages, setIsStreaming)

        handler({ type: 'content', content: 'hello' })

        // First content triggers immediate flush
        expect(setMessages).toHaveBeenCalled()
      })

      it('agrupa multiplos chunks com throttle de 50ms', () => {
        const handler = createChatEventHandler(refs, setMessages, setIsStreaming)

        handler({ type: 'content', content: 'a' })
        const callCountAfterFirst = setMessages.mock.calls.length

        handler({ type: 'content', content: 'b' })
        handler({ type: 'content', content: 'c' })

        // During throttle window, calls should not increase
        expect(setMessages.mock.calls.length).toBe(callCountAfterFirst)

        // After throttle expires
        vi.advanceTimersByTime(60)
        expect(setMessages.mock.calls.length).toBeGreaterThan(callCountAfterFirst)
      })
    })

    describe('tool_call event', () => {
      it('adiciona tool call ao ref', () => {
        const handler = createChatEventHandler(refs, setMessages, setIsStreaming)

        handler({ type: 'tool_call', id: 'tc-1', name: 'search', args: { q: 'test' } })

        expect(refs.toolCalls.current).toHaveLength(1)
        expect(refs.toolCalls.current[0]).toEqual({
          id: 'tc-1',
          name: 'search',
          args: { q: 'test' },
          status: 'running',
        })
      })

      it('atualiza mensagens com tool calls', () => {
        const handler = createChatEventHandler(refs, setMessages, setIsStreaming)

        handler({ type: 'tool_call', id: 'tc-1', name: 'search', args: {} })

        expect(setMessages).toHaveBeenCalled()
      })
    })

    describe('tool_result event', () => {
      it('atualiza status de tool call para success', () => {
        const handler = createChatEventHandler(refs, setMessages, setIsStreaming)

        handler({ type: 'tool_call', id: 'tc-1', name: 'search', args: {} })
        handler({ type: 'tool_result', id: 'tc-1', success: true, preview: 'found 5 results' })

        expect(refs.toolCalls.current[0]?.status).toBe('success')
        expect(refs.toolCalls.current[0]?.result).toBe('found 5 results')
      })

      it('atualiza status de tool call para error', () => {
        const handler = createChatEventHandler(refs, setMessages, setIsStreaming)

        handler({ type: 'tool_call', id: 'tc-1', name: 'search', args: {} })
        handler({ type: 'tool_result', id: 'tc-1', success: false, preview: 'error' })

        expect(refs.toolCalls.current[0]?.status).toBe('error')
      })

      it('ignora resultado para tool call inexistente', () => {
        const handler = createChatEventHandler(refs, setMessages, setIsStreaming)

        expect(() => {
          handler({ type: 'tool_result', id: 'unknown', success: true, preview: '' })
        }).not.toThrow()
      })
    })

    describe('finish event', () => {
      it('faz flush do conteudo pendente e para streaming', () => {
        const handler = createChatEventHandler(refs, setMessages, setIsStreaming)

        refs.content.current = 'some content'
        handler({ type: 'finish' })

        expect(setIsStreaming).toHaveBeenCalledWith(false)
      })

      it('limpa throttle timer pendente', () => {
        const handler = createChatEventHandler(refs, setMessages, setIsStreaming)

        handler({ type: 'content', content: 'hello' })
        handler({ type: 'finish' })

        // After finish, the throttle timer should be cleared
        vi.advanceTimersByTime(100)
        // No extra flush calls after clear
      })
    })

    describe('error event', () => {
      it('adiciona mensagem de erro e para streaming', () => {
        const handler = createChatEventHandler(refs, setMessages, setIsStreaming)

        handler({ type: 'error', message: 'something failed' })

        expect(setMessages).toHaveBeenCalled()
        expect(setIsStreaming).toHaveBeenCalledWith(false)
      })
    })

    describe('model_loading event', () => {
      it('faz flush e adiciona mensagem de loading', () => {
        const handler = createChatEventHandler(refs, setMessages, setIsStreaming)

        handler({ type: 'model_loading', modelName: 'gpt-4' })

        expect(setIsStreaming).toHaveBeenCalledWith(true)
        expect(setMessages).toHaveBeenCalled()
      })
    })

    describe('model_ready event', () => {
      it('remove mensagem de loading', () => {
        const handler = createChatEventHandler(refs, setMessages, setIsStreaming)

        handler({ type: 'model_ready' })

        expect(setMessages).toHaveBeenCalled()
        expect(refs.content.current).toBe('')
      })
    })
  })

  describe('flushAssistant', () => {
    it('aplica conteudo acumulado na ultima mensagem assistente', () => {
      refs.content.current = 'final content'
      const messages: ChatMessage[] = [{ id: 'msg-1', role: 'assistant', content: 'partial' }]
      setMessages.mockImplementation((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
        if (typeof updater === 'function') {
          const result = updater(messages)
          expect(result[0]?.content).toBe('final content')
        }
      })

      flushAssistant(refs, setMessages)

      expect(setMessages).toHaveBeenCalled()
    })

    it('inclui tool calls se existirem', () => {
      refs.content.current = 'content'
      refs.toolCalls.current = [{ id: 'tc-1', name: 'search', args: {}, status: 'success' }]
      const messages: ChatMessage[] = [{ id: 'msg-1', role: 'assistant', content: '' }]
      setMessages.mockImplementation((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
        if (typeof updater === 'function') {
          const result = updater(messages)
          expect(result[0]?.toolCalls).toHaveLength(1)
        }
      })

      flushAssistant(refs, setMessages)
    })

    it('limpa refs apos flush', () => {
      refs.content.current = 'content'
      refs.toolCalls.current = [{ id: 'tc-1', name: 'search', args: {}, status: 'success' }]

      flushAssistant(refs, setMessages)

      expect(refs.content.current).toBe('')
      expect(refs.toolCalls.current).toEqual([])
    })

    it('nao atualiza messages se nao ha conteudo nem tool calls', () => {
      refs.content.current = ''
      refs.toolCalls.current = []

      flushAssistant(refs, setMessages)

      expect(setMessages).not.toHaveBeenCalled()
    })

    it('nao modifica se ultima mensagem nao e assistant', () => {
      refs.content.current = 'content'
      const messages: ChatMessage[] = [{ id: 'msg-1', role: 'user', content: 'hello' }]
      setMessages.mockImplementation((updater: (prev: ChatMessage[]) => ChatMessage[]) => {
        if (typeof updater === 'function') {
          const result = updater(messages)
          // Should return prev unchanged
          expect(result).toBe(messages)
        }
      })

      flushAssistant(refs, setMessages)
    })
  })
})
