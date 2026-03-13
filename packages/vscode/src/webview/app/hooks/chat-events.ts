/**
 * chat-events
 * Descrição: Processamento de eventos de chat extraído do useChat para manter funções menores.
 * Usa throttle (50ms) no content streaming para evitar flicker:
 * acumula chunks no ref e atualiza React state no máximo a cada FLUSH_INTERVAL_MS.
 */

import type { MutableRefObject, Dispatch, SetStateAction } from 'react'
import type { ChatMessage, ToolCallInfo } from './useChat.js'

/** FLUSH_INTERVAL_MS - Intervalo mínimo entre updates de React state durante streaming (ms) */
const FLUSH_INTERVAL_MS = 50

/**
 * ChatRefs
 * Descrição: Refs mutáveis usados para acumular dados durante streaming sem re-renders.
 */
export interface ChatRefs {
  /** Conteúdo textual acumulado do assistente */
  content: MutableRefObject<string>
  /** Tool calls acumuladas durante a resposta */
  toolCalls: MutableRefObject<ToolCallInfo[]>
  /** Contador incremental de IDs de mensagens */
  messageId: MutableRefObject<number>
}

/**
 * SetMessages
 * Descrição: Tipo do setter de estado para a lista de mensagens do chat.
 */
type SetMessages = Dispatch<SetStateAction<ChatMessage[]>>

/**
 * SetStreaming
 * Descrição: Tipo do setter de estado para o flag de streaming.
 */
type SetStreaming = Dispatch<SetStateAction<boolean>>

/**
 * createChatEventHandler
 * Descrição: Cria um handler para eventos de chat com throttle de conteúdo streaming.
 * Processa eventos de content, tool_call, tool_result, finish, error, model_loading e model_ready.
 * @param refs - Refs mutáveis para acumular dados sem re-renders
 * @param setMessages - Setter de estado das mensagens
 * @param setIsStreaming - Setter de estado do flag de streaming
 * @returns Função handler que processa eventos de chat
 */
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

/**
 * flushContentToState
 * Descrição: Aplica o conteúdo acumulado nos refs ao React state (chamado pelo throttle).
 * Atualiza a última mensagem do assistente ou cria uma nova se necessário.
 * @param refs - Refs com conteúdo acumulado
 * @param setMessages - Setter de estado das mensagens
 * @param setIsStreaming - Setter de estado do streaming
 * @returns void
 */
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

/**
 * handleToolCall
 * Descrição: Processa evento de início de tool call, adicionando à lista de tool calls.
 * @param event - Evento com id, name e args da tool call
 * @param refs - Refs para acumular tool calls
 * @param setMessages - Setter de estado das mensagens
 * @returns void
 */
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

/**
 * handleToolResult
 * Descrição: Processa evento de resultado de tool call, atualizando status e preview.
 * @param event - Evento com id, success e preview da tool call
 * @param refs - Refs com tool calls acumuladas
 * @param setMessages - Setter de estado das mensagens
 * @returns void
 */
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

/**
 * handleError
 * Descrição: Processa evento de erro, adicionando mensagem de erro e parando o streaming.
 * @param event - Evento com mensagem de erro
 * @param refs - Refs para gerar ID da mensagem
 * @param setMessages - Setter de estado das mensagens
 * @param setIsStreaming - Setter de estado do streaming
 * @returns void
 */
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

/**
 * updateToolCalls
 * Descrição: Atualiza as tool calls na última mensagem do assistente no React state.
 * @param refs - Refs com tool calls acumuladas
 * @param setMessages - Setter de estado das mensagens
 * @returns void
 */
function updateToolCalls(refs: ChatRefs, setMessages: SetMessages): void {
  setMessages((prev) => {
    const last = prev[prev.length - 1]
    if (last?.role === 'assistant') {
      return [...prev.slice(0, -1), { ...last, toolCalls: [...refs.toolCalls.current] }]
    }
    return prev
  })
}

/**
 * flushAssistant
 * Descrição: Aplica todo o conteúdo e tool calls acumulados na última mensagem do assistente
 * e limpa os refs para a próxima resposta.
 * @param refs - Refs com conteúdo e tool calls acumulados
 * @param setMessages - Setter de estado das mensagens
 * @returns void
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

/**
 * handleModelLoading
 * Descrição: Processa evento de carregamento de modelo, exibindo indicador de loading.
 * @param event - Evento com modelName sendo carregado
 * @param refs - Refs para flush de conteúdo pendente
 * @param setMessages - Setter de estado das mensagens
 * @param setIsStreaming - Setter de estado do streaming
 * @returns void
 */
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

/**
 * handleModelReady
 * Descrição: Processa evento de modelo pronto, removendo o indicador de loading.
 * @param refs - Refs para resetar conteúdo
 * @param setMessages - Setter de estado das mensagens
 * @returns void
 */
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
