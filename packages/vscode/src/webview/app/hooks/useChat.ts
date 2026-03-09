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

    // Codebase slash command responses
    on('codebase:result', (d: unknown) => {
      const data = d as {
        results: Array<{ file: string; startLine: number; symbolName?: string; score: number }>
        query: string
      }
      const lines = data.results.map(
        (r, i) =>
          `${i + 1}. \`${r.file}:${r.startLine}\`${r.symbolName ? ` — **${r.symbolName}**` : ''} [${Math.round(r.score * 100)}%]`,
      )
      const md =
        data.results.length > 0
          ? `**Resultados para "${data.query}":**\n\n${lines.join('\n')}`
          : `Nenhum resultado para "${data.query}". Execute *Athion: Index Codebase* primeiro.`
      setMessages((prev) => [
        ...prev,
        { id: `codebase-${Date.now()}`, role: 'assistant' as const, content: md },
      ])
    })
    on('codebase:indexed', (d: unknown) => {
      const data = d as { totalFiles: number; totalChunks: number }
      setMessages((prev) => [
        ...prev,
        {
          id: `codebase-idx-${Date.now()}`,
          role: 'assistant' as const,
          content: `Codebase indexado: ${data.totalFiles} arquivos, ${data.totalChunks} chunks.`,
        },
      ])
    })
    on('codebase:error', (d: unknown) => {
      const data = d as { message: string }
      setMessages((prev) => [
        ...prev,
        {
          id: `codebase-err-${Date.now()}`,
          role: 'assistant' as const,
          content: `Erro no codebase: ${data.message}`,
        },
      ])
    })

    post({ type: 'ready' })
  }, [])

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || isStreaming) return

      // Slash command: /codebase [query] ou /codebase index
      const codebaseMatch = content.trim().match(/^\/codebase\s*(.*)$/)
      if (codebaseMatch) {
        const arg = (codebaseMatch[1] ?? '').trim()
        setMessages((prev) => [
          ...prev,
          { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
        ])
        if (arg === 'index' || arg === '') {
          post({ type: 'codebase:index' })
        } else {
          post({ type: 'codebase:search', query: arg })
        }
        return
      }

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
