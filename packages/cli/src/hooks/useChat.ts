/**
 * Hook useChat — Gerencia estado do chat e streaming.
 *
 * Consome o AsyncGenerator<OrchestratorEvent> do core e traduz
 * os eventos em estado React para os componentes renderizarem.
 *
 * Estado principal:
 * - messages: histórico completo de mensagens
 * - isStreaming: se está recebendo resposta do LLM
 * - currentTool: tool call em andamento (null se nenhuma)
 * - currentAgent: subagente em andamento (null se nenhum)
 * - tokens: uso de tokens da última resposta
 */

import { useCallback, useRef, useState } from 'react'
import type { AthionCore } from '@athion/core'
import type { ChatMessage, SubAgentInfo, TokenInfo, ToolCallInfo } from '../types.js'

interface UseChatReturn {
  messages: ChatMessage[]
  isStreaming: boolean
  currentTool: ToolCallInfo | null
  currentAgent: SubAgentInfo | null
  tokens: TokenInfo | null
  sendMessage: (content: string) => Promise<void>
}

export function useChat(core: AthionCore, sessionId: string): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentTool, setCurrentTool] = useState<ToolCallInfo | null>(null)
  const [currentAgent, setCurrentAgent] = useState<SubAgentInfo | null>(null)
  const [tokens, setTokens] = useState<TokenInfo | null>(null)
  const streamingContentRef = useRef('')

  const sendMessage = useCallback(
    async (content: string) => {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsStreaming(true)
      streamingContentRef.current = ''

      const assistantId = crypto.randomUUID()
      const toolCalls: ToolCallInfo[] = []

      try {
        const stream = core.orchestrator.chat(sessionId, { content })

        for await (const event of stream) {
          switch (event.type) {
            case 'content':
              streamingContentRef.current += event.content
              updateAssistantMessage(assistantId, streamingContentRef.current, toolCalls)
              break

            case 'tool_call':
              handleToolCall(event, toolCalls)
              break

            case 'tool_result':
              handleToolResult(event, toolCalls)
              updateAssistantMessage(assistantId, streamingContentRef.current, toolCalls)
              break

            case 'subagent_start':
              setCurrentAgent({ name: event.agentName, status: 'running', continuations: 0 })
              break

            case 'subagent_complete':
              setCurrentAgent(null)
              break

            case 'finish':
              setTokens({
                promptTokens: event.usage.promptTokens,
                completionTokens: event.usage.completionTokens,
                totalTokens: event.usage.totalTokens,
              })
              break
          }
        }
      } finally {
        setIsStreaming(false)
        setCurrentTool(null)
        setCurrentAgent(null)
      }
    },
    [core, sessionId],
  )

  function updateAssistantMessage(id: string, content: string, tools: ToolCallInfo[]) {
    setMessages((prev) => {
      const existing = prev.find((m) => m.id === id)
      if (existing) {
        return prev.map((m) => (m.id === id ? { ...m, content, toolCalls: [...tools] } : m))
      }
      return [
        ...prev,
        {
          id,
          role: 'assistant' as const,
          content,
          timestamp: new Date(),
          toolCalls: [...tools],
        },
      ]
    })
  }

  function handleToolCall(
    event: { id: string; name: string; args: unknown },
    toolCalls: ToolCallInfo[],
  ) {
    const tc: ToolCallInfo = {
      id: event.id,
      name: event.name,
      args: event.args,
      status: 'running',
    }
    toolCalls.push(tc)
    setCurrentTool(tc)
  }

  function handleToolResult(
    event: { id: string; name: string; result: { success: boolean; error?: string } },
    toolCalls: ToolCallInfo[],
  ) {
    const tc = toolCalls.find((t) => t.name === event.name && t.status === 'running')
    if (tc) {
      tc.status = event.result.success ? 'success' : 'error'
      tc.result = event.result.success
        ? JSON.stringify(event.result).slice(0, 200)
        : event.result.error
    }
    setCurrentTool(null)
  }

  return { messages, isStreaming, currentTool, currentAgent, tokens, sendMessage }
}
