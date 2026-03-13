/**
 * MessageList
 * Descrição: Componente que exibe a lista de mensagens do chat com auto-scroll e suporte a code blocks.
 */

import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../hooks/useChat.js'
import { CodeBlock } from './CodeBlock.js'
import { ToolCallCard } from './ToolCallCard.js'
import { useFeedbackPhrase } from '../hooks/useFeedbackPhrase.js'

/** MessageListProps
 * Descrição: Propriedades do componente MessageList
 */
interface MessageListProps {
  /** Lista de mensagens a serem exibidas */
  messages: ChatMessage[]
  /** Indica se o assistente está gerando uma resposta */
  isStreaming: boolean
}

/** MessageList
 * Descrição: Componente que renderiza todas as mensagens do chat com auto-scroll, code blocks formatados e cards de tool calls
 * @param messages - Lista de mensagens do chat
 * @param isStreaming - Estado de streaming do assistente
 * @returns Elemento JSX com a lista de mensagens renderizadas
 */
export function MessageList({ messages, isStreaming }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const feedbackPhrase = useFeedbackPhrase(isStreaming)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages, isStreaming])

  if (messages.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex flex-1 items-center justify-center p-8 text-neutral-500"
      >
        <div className="text-center">
          <p className="text-lg">Como posso ajudar?</p>
          <p className="mt-2 text-sm text-neutral-600">Digite sua mensagem abaixo para começar.</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
        >
          <span className="mb-1 text-xs font-medium text-neutral-500">
            {msg.role === 'user' ? 'Você' : 'Athion'}
          </span>
          <div
            className={`max-w-[85%] rounded-xl px-4 py-2.5 ${
              msg.role === 'user' ? 'bg-accent-600 text-white' : 'bg-surface-800 text-neutral-100'
            }`}
          >
            <div className="prose text-sm leading-relaxed">
              <FormattedContent content={msg.content} />
            </div>
          </div>
          {msg.toolCalls?.map((tc) => (
            <div key={tc.id} className="mt-1 max-w-[85%]">
              <ToolCallCard toolCall={tc} />
            </div>
          ))}
        </div>
      ))}
      {isStreaming && (
        <div className="flex items-center gap-2 px-4 text-accent-400">
          <span className="animate-pulse">▌</span>
          {feedbackPhrase && (
            <span className="text-xs text-neutral-500 italic">{feedbackPhrase}</span>
          )}
        </div>
      )}
    </div>
  )
}

/** FormattedContent
 * Descrição: Componente auxiliar que renderiza conteúdo de texto com code blocks formatados usando o componente CodeBlock
 * @param content - Conteúdo textual a ser renderizado, podendo conter blocos de código delimitados por ```
 * @returns Elemento JSX com o conteúdo formatado
 */
function FormattedContent({ content }: { content: string }) {
  if (!content) return null

  const parts = content.split(/(```[\s\S]*?```)/g)

  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const match = part.match(/```(\w*)\n([\s\S]*?)```/)
          if (match) {
            return <CodeBlock key={i} language={match[1] || 'text'} code={match[2]} />
          }
        }
        return (
          <span key={i}>
            {part.split('\n').map((line, j) => (
              <span key={j}>
                {line}
                {j < part.split('\n').length - 1 && <br />}
              </span>
            ))}
          </span>
        )
      })}
    </>
  )
}
