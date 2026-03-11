/**
 * MessageList — Lista de mensagens do chat com auto-scroll.
 */

import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../hooks/useChat.js'
import { CodeBlock } from './CodeBlock.js'
import { ToolCallCard } from './ToolCallCard.js'
import { useFeedbackPhrase } from '../hooks/useFeedbackPhrase.js'

interface MessageListProps {
  messages: ChatMessage[]
  isStreaming: boolean
}

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
          <p>Como posso ajudar?</p>
          <p className="hint">Selecione código no editor e use Cmd+Shift+E para explicar.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="message-list" ref={containerRef}>
      {messages.map((msg) => (
        <div key={msg.id} className={`message ${msg.role}`}>
          <div className="message-role">{msg.role === 'user' ? 'Você' : 'Athion'}</div>
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

/** Renderiza conteúdo com code blocks formatados */
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
