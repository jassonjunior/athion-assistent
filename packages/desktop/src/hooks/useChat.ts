/**
 * useChat — Gerencia estado do chat no desktop app.
 *
 * Usa Tauri Bridge (invoke/listen) em vez de Messenger (postMessage).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import * as bridge from '../bridge/tauri-bridge.js'
import { createChatEventHandler, flushAssistant, type ChatRefs } from './chat-events.js'
import type { SidecarStatus } from '../bridge/types.js'

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

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<SidecarStatus>('starting')
  const refs: ChatRefs = {
    content: useRef(''),
    toolCalls: useRef<ToolCallInfo[]>([]),
    messageId: useRef(0),
  }

  // Listen for chat events from sidecar
  useEffect(() => {
    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    const unlisten = bridge.onChatEvent(handler)

    // Check sidecar status and create initial session
    initSession()

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  const initSession = useCallback(async () => {
    try {
      await bridge.ping()
      const session = await bridge.sessionCreate('default')
      setSessionId(session.id)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming || !sessionId) return
      setMessages((prev) => [
        ...prev,
        { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
      ])
      refs.content.current = ''
      refs.toolCalls.current = []
      setIsStreaming(true)
      try {
        await bridge.chatSend(sessionId, content)
      } catch {
        flushAssistant(refs, setMessages)
        setIsStreaming(false)
      }
    },
    [isStreaming, sessionId, refs],
  )

  const abort = useCallback(async () => {
    if (sessionId) await bridge.chatAbort(sessionId)
    setIsStreaming(false)
  }, [sessionId])

  const newSession = useCallback(async () => {
    setMessages([])
    refs.content.current = ''
    refs.toolCalls.current = []
    try {
      const session = await bridge.sessionCreate('default')
      setSessionId(session.id)
    } catch {
      // ignore
    }
  }, [refs])

  return { messages, isStreaming, sessionId, status, sendMessage, abort, newSession }
}
