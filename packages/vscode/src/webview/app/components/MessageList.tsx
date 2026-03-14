/**
 * MessageList
 * Descrição: Componente de lista de mensagens do chat com auto-scroll e frases de feedback.
 */

import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../hooks/useChat.js'
import { CodeBlock } from './CodeBlock.js'
import { ToolCallCard } from './ToolCallCard.js'
import { useFeedbackPhrase } from '../hooks/useFeedbackPhrase.js'
import { t } from '@athion/shared'

/**
 * MessageListProps
 * Descrição: Props do componente MessageList.
 */
interface MessageListProps {
  /** Lista de mensagens do chat a serem renderizadas */
  messages: ChatMessage[]
  /** Indica se está em modo de streaming (mostra indicador) */
  isStreaming: boolean
}

/**
 * MessageList
 * Descrição: Renderiza a lista de mensagens do chat com auto-scroll, code blocks formatados
 * e indicador de streaming com frases de feedback.
 * @param messages - Array de mensagens do chat
 * @param isStreaming - Flag de streaming ativo
 * @returns Elemento JSX da lista de mensagens
 */
export function MessageList({ messages, isStreaming }: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const feedbackPhrase = useFeedbackPhrase(isStreaming)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages, isStreaming])

  if (messages.length === 0) {
    return (
      <div className="message-list empty" ref={containerRef}>
        <div className="empty-state">
          <p>{t('vscode.ui.welcome')}</p>
          <p className="hint">{t('vscode.ui.welcome_hint')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="message-list" ref={containerRef}>
      {messages.map((msg) => (
        <div key={msg.id} className={`message ${msg.role}`}>
          <div className="message-role">
            {msg.role === 'user' ? t('vscode.ui.you') : t('vscode.ui.assistant')}
          </div>
          <div className="message-content">
            <FormattedContent content={msg.content} />
          </div>
          {msg.toolCalls?.map((tc) => (
            <ToolCallCard key={tc.id} toolCall={tc} />
          ))}
        </div>
      ))}
      {isStreaming && (
        <div className="streaming-indicator">
          <span className="cursor">▌</span>
          {feedbackPhrase && <span className="feedback-phrase">{feedbackPhrase}</span>}
        </div>
      )}
    </div>
  )
}

/**
 * FormattedContent
 * Descrição: Renderiza conteúdo textual com code blocks formatados (```lang...```) e quebras de linha.
 * @param content - Conteúdo de texto com possíveis code blocks em markdown
 * @returns Elemento JSX com conteúdo formatado ou null se vazio
 */
function FormattedContent({ content }: { content: string }) {
  if (!content) return null

  // Split by code blocks (```lang\ncode\n```)
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
        // Regular text — preserve line breaks
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
