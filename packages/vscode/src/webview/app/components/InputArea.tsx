/**
 * InputArea — Campo de entrada com Ctrl+Enter para enviar.
 */

import { useCallback, useRef, useState } from 'react'

interface InputAreaProps {
  onSubmit: (content: string) => void
  onAbort: () => void
  isStreaming: boolean
  isDisabled: boolean
}

export function InputArea({ onSubmit, onAbort, isStreaming, isDisabled }: InputAreaProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Ctrl+Enter or Cmd+Enter to submit
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        if (value.trim() && !isStreaming && !isDisabled) {
          onSubmit(value.trim())
          setValue('')
        }
        return
      }

      // Enter without modifier also submits (single line behavior)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (value.trim() && !isStreaming && !isDisabled) {
          onSubmit(value.trim())
          setValue('')
        }
      }
    },
    [value, isStreaming, isDisabled, onSubmit],
  )

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    // Auto-resize textarea
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }, [])

  return (
    <div className="input-area">
      {isStreaming ? (
        <button className="abort-button" onClick={onAbort}>
          Parar
        </button>
      ) : (
        <textarea
          ref={textareaRef}
          className="chat-input"
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={isDisabled ? 'Conectando...' : 'Digite sua mensagem... (Enter para enviar)'}
          disabled={isDisabled}
          rows={1}
        />
      )}
    </div>
  )
}
