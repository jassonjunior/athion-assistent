/**
 * Chat event processing — extracted from useChat to stay under max-lines-per-function.
 */

import type { MutableRefObject, Dispatch, SetStateAction } from 'react'
import type { ChatMessage, ToolCallInfo } from './useChat.js'

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
  return (event: { type: string; [key: string]: unknown }) => {
    switch (event.type) {
      case 'content':
        handleContent(event, refs, setMessages, setIsStreaming)
        break
      case 'tool_call':
        handleToolCall(event, refs, setMessages)
        break
      case 'tool_result':
        handleToolResult(event, refs, setMessages)
        break
      case 'finish':
        flushAssistant(refs, setMessages)
        setIsStreaming(false)
        break
      case 'error':
        handleError(event, refs, setMessages, setIsStreaming)
        break
    }
  }
}

function handleContent(
  event: { [key: string]: unknown },
  refs: ChatRefs,
  setMessages: SetMessages,
  setIsStreaming: SetStreaming,
): void {
  refs.content.current += event.content as string
  setMessages((prev) => {
    const last = prev[prev.length - 1]
    if (last?.role === 'assistant') {
      return [...prev.slice(0, -1), { ...last, content: refs.content.current }]
    }
    setIsStreaming(true)
    return [
      ...prev,
      {
        id: `msg-${++refs.messageId.current}`,
        role: 'assistant' as const,
        content: refs.content.current,
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
