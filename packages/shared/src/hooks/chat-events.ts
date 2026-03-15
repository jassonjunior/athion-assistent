/**
 * chat-events
 * Descrição: Processamento de eventos de chat extraído para compartilhamento entre frontends.
 * Suporta throttle opcional de conteúdo streaming para evitar flicker.
 */

import type { MutableRefObject, Dispatch, SetStateAction } from 'react'

/** ChatMessage
 * Descrição: Representa uma mensagem de chat entre o usuário e o assistente
 */
export interface ChatMessage {
  /** Identificador único da mensagem */
  id: string
  /** Papel do remetente da mensagem */
  role: 'user' | 'assistant'
  /** Conteúdo textual da mensagem */
  content: string
  /** Lista opcional de chamadas de ferramentas associadas à mensagem */
  toolCalls?: ToolCallInfo[] | undefined
}

/** ToolCallInfo
 * Descrição: Informações sobre uma chamada de ferramenta (tool call) feita pelo assistente
 */
export interface ToolCallInfo {
  /** Identificador único da chamada de ferramenta */
  id: string
  /** Nome da ferramenta invocada */
  name: string
  /** Argumentos passados para a ferramenta */
  args: unknown
  /** Estado atual da execução da ferramenta */
  status: 'running' | 'success' | 'error'
  /** Preview textual do resultado da ferramenta */
  result?: string | undefined
}

/** ChatRefs
 * Descrição: Referências mutáveis compartilhadas entre o handler de eventos e o hook useChat
 */
export interface ChatRefs {
  /** Referência ao conteúdo acumulado da mensagem do assistente em streaming */
  content: MutableRefObject<string>
  /** Referência à lista de chamadas de ferramentas ativas */
  toolCalls: MutableRefObject<ToolCallInfo[]>
  /** Referência ao contador incremental de IDs de mensagens */
  messageId: MutableRefObject<number>
}

/** SetMessages — Tipo do dispatch para atualizar o estado das mensagens do chat */
type SetMessages = Dispatch<SetStateAction<ChatMessage[]>>

/** SetStreaming — Tipo do dispatch para atualizar o estado de streaming */
type SetStreaming = Dispatch<SetStateAction<boolean>>

/** ChatEventHandlerOptions
 * Descrição: Opções para criar o handler de eventos de chat
 */
export interface ChatEventHandlerOptions {
  /** Intervalo de throttle em ms para content streaming (0 = sem throttle) */
  throttleMs?: number
  /** Handler customizado para evento model_loading (opcional) */
  onModelLoading?: (event: { [key: string]: unknown }) => void
  /** Handler customizado para evento model_ready (opcional) */
  onModelReady?: () => void
}

/** createChatEventHandler
 * Descrição: Cria um handler de eventos que processa notificações do sidecar com throttle opcional
 * @param refs - Referências mutáveis compartilhadas para acumular conteúdo e tool calls
 * @param setMessages - Dispatch para atualizar o estado das mensagens
 * @param setIsStreaming - Dispatch para atualizar o estado de streaming
 * @param options - Opções de configuração (throttle, handlers customizados)
 * @returns Função handler que recebe eventos tipados do sidecar
 */
export function createChatEventHandler(
  refs: ChatRefs,
  setMessages: SetMessages,
  setIsStreaming: SetStreaming,
  options: ChatEventHandlerOptions = {},
) {
  const { throttleMs = 0 } = options

  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let dirty = false

  function flushContentToState(): void {
    const snapshot = refs.content.current
    setMessages((prev) => {
      const last = prev[prev.length - 1]
      if (last?.role === 'assistant') {
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

  function handleContentWithThrottle(): void {
    if (throttleMs <= 0) {
      flushContentToState()
      return
    }
    if (flushTimer !== null) {
      dirty = true
      return
    }
    flushContentToState()
    dirty = false
    flushTimer = setTimeout(() => {
      flushTimer = null
      if (dirty) {
        flushContentToState()
        dirty = false
      }
    }, throttleMs)
  }

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
        handleContentWithThrottle()
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
        if (options.onModelLoading) {
          options.onModelLoading(event)
        }
        break
      case 'model_ready':
        if (options.onModelReady) {
          options.onModelReady()
        }
        break
    }
  }
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

/** flushAssistant
 * Descrição: Finaliza a mensagem do assistente, persistindo conteúdo e tool calls acumulados
 */
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
