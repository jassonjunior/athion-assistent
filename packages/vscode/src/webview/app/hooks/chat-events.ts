/**
 * Chat event processing — extracted from useChat to stay under max-lines-per-function.
 *
 * Usa throttle (50ms) no content streaming para evitar flicker:
 * acumula chunks no ref e atualiza React state no máximo a cada FLUSH_INTERVAL_MS.
 */

import type { MutableRefObject, Dispatch, SetStateAction } from 'react'
import type { ChatMessage, ToolCallInfo } from './useChat.js'

/** Intervalo mínimo entre updates de React state durante streaming (ms). */
const FLUSH_INTERVAL_MS = 50

export interface ChatRefs {
  content: MutableRefObject<string>
  toolCalls: MutableRefObject<ToolCallInfo[]>
  messageId: MutableRefObject<number>
}

type SetMessages = Dispatch<SetStateAction<ChatMessage[]>>
type SetStreaming = Dispatch<SetStateAction<boolean>>

export function createChatEventHandler(
  refs: ChatRefs,
  setMessages: SetMessages,
  setIsStreaming: SetStreaming,
) {
  /** Timer do throttle — enquanto não-null, chunks acumulam sem re-render. */
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  /** Flag: se true, há conteúdo novo no ref que ainda não foi para o React state. */
  let dirty = false

  /** Aplica o conteúdo acumulado no ref ao React state. */
  function scheduleFlush(): void {
    if (flushTimer !== null) {
      dirty = true
      return
    }
    flushContentToState(refs, setMessages, setIsStreaming)
    dirty = false
    flushTimer = setTimeout(() => {
      flushTimer = null
      if (dirty) {
        flushContentToState(refs, setMessages, setIsStreaming)
        dirty = false
      }
    }, FLUSH_INTERVAL_MS)
  }

  /** Limpa timer pendente (chamado no finish/error). */
  function clearThrottle(): void {
    if (flushTimer !== null) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    dirty = false
  }

  return (event: { type: string; [key: string]: unknown }) => {
    switch (event.type) {
      case 'content':
        refs.content.current += event.content as string
        scheduleFlush()
        break
      case 'tool_call':
        handleToolCall(event, refs, setMessages)
        break
      case 'tool_result':
        handleToolResult(event, refs, setMessages)
        break
      case 'finish':
        clearThrottle()
        flushAssistant(refs, setMessages)
        setIsStreaming(false)
        break
      case 'error':
        clearThrottle()
        handleError(event, refs, setMessages, setIsStreaming)
        break
      case 'model_loading':
        clearThrottle()
        handleModelLoading(event, refs, setMessages, setIsStreaming)
        break
      case 'model_ready':
        handleModelReady(refs, setMessages)
        break
    }
  }
}

/** Aplica conteúdo acumulado no ref ao React state (throttled). */
function flushContentToState(
  refs: ChatRefs,
  setMessages: SetMessages,
  setIsStreaming: SetStreaming,
): void {
  const snapshot = refs.content.current
  setMessages((prev) => {
    const last = prev[prev.length - 1]
    if (last?.role === 'assistant') {
      // Muta o objeto existente em vez de criar novo array quando só content muda
      if (last.content === snapshot) return prev
      const updated = [...prev]
      updated[updated.length - 1] = { ...last, content: snapshot }
      return updated
    }
    setIsStreaming(true)
    return [
      ...prev,
      {
        id: `msg-${++refs.messageId.current}`,
        role: 'assistant' as const,
        content: snapshot,
      },
    ]
  })
}

function handleToolCall(
  event: { [key: string]: unknown },
  refs: ChatRefs,
  setMessages: SetMessages,
): void {
  refs.toolCalls.current.push({
    id: event.id as string,
    name: event.name as string,
    args: event.args,
    status: 'running',
  })
  updateToolCalls(refs, setMessages)
}

function handleToolResult(
  event: { [key: string]: unknown },
  refs: ChatRefs,
  setMessages: SetMessages,
): void {
  const tc = refs.toolCalls.current.find((t) => t.id === event.id)
  if (tc) {
    tc.status = (event.success as boolean) ? 'success' : 'error'
    tc.result = event.preview as string
  }
  updateToolCalls(refs, setMessages)
}

function handleError(
  event: { [key: string]: unknown },
  refs: ChatRefs,
  setMessages: SetMessages,
  setIsStreaming: SetStreaming,
): void {
  setMessages((prev) => [
    ...prev,
    {
      id: `msg-${++refs.messageId.current}`,
      role: 'assistant' as const,
      content: `Error: ${event.message as string}`,
    },
  ])
  setIsStreaming(false)
}

function updateToolCalls(refs: ChatRefs, setMessages: SetMessages): void {
  setMessages((prev) => {
    const last = prev[prev.length - 1]
    if (last?.role === 'assistant') {
      return [...prev.slice(0, -1), { ...last, toolCalls: [...refs.toolCalls.current] }]
    }
    return prev
  })
}

export function flushAssistant(refs: ChatRefs, setMessages: SetMessages): void {
  if (refs.content.current || refs.toolCalls.current.length > 0) {
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant') {
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            content: refs.content.current,
            toolCalls: refs.toolCalls.current.length > 0 ? [...refs.toolCalls.current] : undefined,
          },
        ]
      }
      return prev
    })
  }
  refs.content.current = ''
  refs.toolCalls.current = []
}

function handleModelLoading(
  event: { [key: string]: unknown },
  refs: ChatRefs,
  setMessages: SetMessages,
  setIsStreaming: SetStreaming,
): void {
  // Flush any pending assistant content before showing loading indicator
  flushAssistant(refs, setMessages)
  setIsStreaming(true)
  setMessages((prev) => [
    ...prev,
    {
      id: `msg-${++refs.messageId.current}`,
      role: 'assistant' as const,
      content: `⏳ Carregando modelo: ${event.modelName as string}...`,
    },
  ])
}

function handleModelReady(refs: ChatRefs, setMessages: SetMessages): void {
  // Remove the loading indicator message (last assistant message with loading text)
  setMessages((prev) => {
    const last = prev[prev.length - 1]
    if (
      last?.role === 'assistant' &&
      (last.content as string).startsWith('⏳ Carregando modelo:')
    ) {
      return prev.slice(0, -1)
    }
    return prev
  })
  refs.content.current = ''
}
