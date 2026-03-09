/**
 * useChat — Gerencia estado do chat no webview.
 *
 * Recebe eventos via Messenger (em vez de AsyncGenerator como no CLI).
 * Acumula conteúdo streaming, rastreia tool calls e subagents.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMessenger } from './useMessenger.js'
import { createChatEventHandler, flushAssistant, type ChatRefs } from './chat-events.js'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallInfo[] | undefined
}

export interface ToolCallInfo {
  id: string
  name: string
  args: unknown
  status: 'running' | 'success' | 'error'
  result?: string | undefined
}

export interface SessionInfo {
  id: string
  title: string
}

type CoreStatus = 'starting' | 'ready' | 'error' | 'stopped'

export function useChat() {
  const { post, on } = useMessenger()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [status, setStatus] = useState<CoreStatus>('starting')
  const refs: ChatRefs = {
    content: useRef(''),
    toolCalls: useRef<ToolCallInfo[]>([]),
    messageId: useRef(0),
  }

  useEffect(() => {
    const handleEvent = createChatEventHandler(refs, setMessages, setIsStreaming)

    on('status:update', (d: unknown) => setStatus((d as { status: CoreStatus }).status))
    on('session:active', (d: unknown) => {
      const s = (d as { session: { id: string; title: string } }).session
      setSession({ id: s.id, title: s.title })
    })
    on('chat:event', (d: unknown) => handleEvent((d as { event: { type: string } }).event))
    on('chat:complete', () => {
      flushAssistant(refs, setMessages)
      setIsStreaming(false)
    })

    post({ type: 'ready' })
  }, [])

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || isStreaming) return
      setMessages((prev) => [
        ...prev,
        { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
      ])
      refs.content.current = ''
      refs.toolCalls.current = []
      setIsStreaming(true)
      post({ type: 'chat:send', content })
    },
    [isStreaming, post, refs],
  )

  const abort = useCallback(() => {
    post({ type: 'chat:abort' })
    setIsStreaming(false)
  }, [post])

  const newSession = useCallback(() => {
    setMessages([])
    refs.content.current = ''
    refs.toolCalls.current = []
    post({ type: 'session:create' })
  }, [post, refs])

  return { messages, isStreaming, session, status, sendMessage, abort, newSession }
}
