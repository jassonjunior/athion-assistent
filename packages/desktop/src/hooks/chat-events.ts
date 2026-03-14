/**
 * Chat event processing
 * Descrição: Processa eventos de chat recebidos do sidecar, extraído do useChat para manter
 * cada função dentro do limite de linhas.
 */

import type { MutableRefObject, Dispatch, SetStateAction } from 'react'
import type { ChatMessage, ToolCallInfo } from './useChat.js'

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

/** SetMessages
 * Descrição: Tipo do dispatch para atualizar o estado das mensagens do chat
 */
type SetMessages = Dispatch<SetStateAction<ChatMessage[]>>

/** SetStreaming
 * Descrição: Tipo do dispatch para atualizar o estado de streaming
 */
type SetStreaming = Dispatch<SetStateAction<boolean>>

/** createChatEventHandler
 * Descrição: Cria um handler de eventos que processa notificações do sidecar (content, tool_call, tool_result, finish, error)
 * @param refs - Referências mutáveis compartilhadas para acumular conteúdo e tool calls
 * @param setMessages - Dispatch para atualizar o estado das mensagens
 * @param setIsStreaming - Dispatch para atualizar o estado de streaming
 * @returns Função handler que recebe eventos tipados do sidecar
 */
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

/** handleContent
 * Descrição: Processa evento de conteúdo textual, acumulando na mensagem do assistente
 * @param event - Evento com o fragmento de conteúdo
 * @param refs - Referências mutáveis compartilhadas
 * @param setMessages - Dispatch para atualizar mensagens
 * @param setIsStreaming - Dispatch para atualizar estado de streaming
 */
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

/** handleToolCall
 * Descrição: Processa evento de chamada de ferramenta, adicionando à lista de tool calls ativas
 * @param event - Evento com id, nome e argumentos da ferramenta
 * @param refs - Referências mutáveis compartilhadas
 * @param setMessages - Dispatch para atualizar mensagens
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

/** handleToolResult
 * Descrição: Processa evento de resultado de ferramenta, atualizando o status e preview do resultado
 * @param event - Evento com id, sucesso e preview do resultado
 * @param refs - Referências mutáveis compartilhadas
 * @param setMessages - Dispatch para atualizar mensagens
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

/** handleError
 * Descrição: Processa evento de erro, adicionando mensagem de erro ao chat e finalizando o streaming
 * @param event - Evento com a mensagem de erro
 * @param refs - Referências mutáveis compartilhadas
 * @param setMessages - Dispatch para atualizar mensagens
 * @param setIsStreaming - Dispatch para atualizar estado de streaming
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

/** updateToolCalls
 * Descrição: Atualiza a lista de tool calls na última mensagem do assistente
 * @param refs - Referências mutáveis compartilhadas
 * @param setMessages - Dispatch para atualizar mensagens
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

/** flushAssistant
 * Descrição: Finaliza a mensagem do assistente, persistindo conteúdo acumulado e tool calls, e limpa as referências
 * @param refs - Referências mutáveis compartilhadas
 * @param setMessages - Dispatch para atualizar mensagens
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
