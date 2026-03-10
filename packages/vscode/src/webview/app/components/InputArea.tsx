/**
 * InputArea — Campo de entrada com Ctrl+Enter para enviar e suporte a @mentions.
 */

import { useCallback, useRef, useState } from 'react'
import { useAtMention } from '../hooks/useAtMention.js'
import { MentionDropdown } from './MentionDropdown.js'

interface InputAreaProps {
  onSubmit: (content: string) => void
  onAbort: () => void
  isStreaming: boolean
  isDisabled: boolean
}

export function InputArea({ onSubmit, onAbort, isStreaming, isDisabled }: InputAreaProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { isOpen, results, query, selectedIndex, handleChange, handleKeyDown, insertMention } =
    useAtMention()

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isStreaming || isDisabled) return
      onSubmit(trimmed)
      setValue('')
    },
    [isStreaming, isDisabled, onSubmit],
  )

  const handleKeyDownCombined = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // @mentions têm prioridade em navegação
      const consumed = handleKeyDown(e)
      if (consumed) {
        // Se Tab/Enter com item selecionado: insere menção
        const selected = results[selectedIndex]
        if ((e.key === 'Tab' || e.key === 'Enter') && selected) {
          const textarea = textareaRef.current
          const cursorPos = textarea?.selectionStart ?? value.length
          const newValue = insertMention(selected, value, cursorPos)
          setValue(newValue)
          // Reposiciona cursor após menção inserida
          requestAnimationFrame(() => {
            if (textarea) {
              const pos = newValue.indexOf(' ', newValue.lastIndexOf('@')) + 1
              textarea.setSelectionRange(pos, pos)
            }
          })
        }
        return
      }

      // Ctrl+Enter ou Cmd+Enter: envia
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        submit(value)
        return
      }

      // Enter sem modificador: envia (comportamento single-line)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submit(value)
      }
    },
    [handleKeyDown, results, selectedIndex, insertMention, value, submit],
  )

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      setValue(newValue)
      handleChange(newValue, e.target.selectionStart ?? newValue.length)
      // Auto-resize
      const textarea = e.target
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    },
    [handleChange],
  )

  return (
    <div className="input-area">
      {isStreaming ? (
        <button className="abort-button" onClick={onAbort}>
          Parar
        </button>
      ) : (
        <div className="input-wrapper" style={{ position: 'relative' }}>
          {isOpen && (
            <MentionDropdown
              results={results}
              selectedIndex={selectedIndex}
              query={query}
              onSelect={(result) => {
                const textarea = textareaRef.current
                const cursorPos = textarea?.selectionStart ?? value.length
                const newValue = insertMention(result, value, cursorPos)
                setValue(newValue)
                textarea?.focus()
              }}
            />
          )}
          <textarea
            ref={textareaRef}
            className="chat-input"
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDownCombined}
            placeholder={
              isDisabled ? 'Conectando...' : 'Digite sua mensagem... (@ para mencionar arquivo)'
            }
            disabled={isDisabled}
            rows={1}
          />
        </div>
      )}
    </div>
  )
}
