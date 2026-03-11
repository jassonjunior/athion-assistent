/**
 * InputArea — Campo de entrada com autocomplete para @mentions, /use-skill e arquivos.
 *
 * Prioridade de autocomplete:
 *  1. useInputAutocomplete (/use-skill + @arquivo via files:list)
 *  2. useAtMention (@arquivo via codebase indexer — só se indexado)
 */

import { useCallback, useRef, useState } from 'react'
import { useAtMention } from '../hooks/useAtMention.js'
import { useInputAutocomplete } from '../hooks/useInputAutocomplete.js'
import { MentionDropdown } from './MentionDropdown.js'
import { AutocompleteDropdown } from './AutocompleteDropdown.js'

interface InputAreaProps {
  onSubmit: (content: string) => void
  onAbort: () => void
  isStreaming: boolean
  isDisabled: boolean
}

export function InputArea({ onSubmit, onAbort, isStreaming, isDisabled }: InputAreaProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Autocomplete 1: /use-skill + @arquivo (sem codebase indexer)
  const autocomplete = useInputAutocomplete()

  // Autocomplete 2: @arquivo semântico (codebase indexer)
  const atMention = useAtMention()

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isStreaming || isDisabled) return
      onSubmit(trimmed)
      setValue('')
      autocomplete.close()
      atMention.close()
    },
    [isStreaming, isDisabled, onSubmit, autocomplete, atMention],
  )

  const handleKeyDownCombined = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current
      const cursorPos = textarea?.selectionStart ?? value.length

      // 1. Autocomplete (/use-skill + @arquivo simples) tem prioridade
      const acConsumed = autocomplete.handleKeyDown(e)
      if (acConsumed) {
        if (e.key === 'Tab' || e.key === 'Enter') {
          const newValue = autocomplete.insertSelected(value, cursorPos)
          if (newValue !== null) {
            setValue(newValue)
            requestAnimationFrame(() => {
              if (textarea) {
                textarea.setSelectionRange(newValue.length, newValue.length)
              }
            })
          }
        }
        return
      }

      // 2. @mention semântico (codebase indexer)
      const mentionConsumed = atMention.handleKeyDown(e)
      if (mentionConsumed) {
        const selected = atMention.results[atMention.selectedIndex]
        if ((e.key === 'Tab' || e.key === 'Enter') && selected) {
          const newValue = atMention.insertMention(selected, value, cursorPos)
          setValue(newValue)
          requestAnimationFrame(() => {
            if (textarea) {
              const pos = newValue.indexOf(' ', newValue.lastIndexOf('@')) + 1
              textarea.setSelectionRange(pos, pos)
            }
          })
        }
        return
      }

      // 3. Ctrl+Enter ou Cmd+Enter: envia
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        submit(value)
        return
      }

      // 4. Enter sem modificador: envia
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submit(value)
      }
    },
    [autocomplete, atMention, value, submit],
  )

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      const cursorPos = e.target.selectionStart ?? newValue.length
      setValue(newValue)
      // Notifica ambos os hooks
      autocomplete.handleChange(newValue, cursorPos)
      atMention.handleChange(newValue, cursorPos)
      // Auto-resize
      const textarea = e.target
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    },
    [autocomplete, atMention],
  )

  // Decide qual dropdown mostrar (autocomplete tem prioridade)
  const showAutocomplete = autocomplete.isOpen
  const showAtMention = !showAutocomplete && atMention.isOpen

  return (
    <div className="input-area">
      {isStreaming ? (
        <button className="abort-button" onClick={onAbort}>
          Parar
        </button>
      ) : (
        <div className="input-wrapper" style={{ position: 'relative' }}>
          {showAutocomplete && (
            <AutocompleteDropdown
              items={autocomplete.items}
              selectedIndex={autocomplete.selectedIndex}
              mode={autocomplete.mode}
              onSelect={(_item) => {
                const textarea = textareaRef.current
                const cursorPos = textarea?.selectionStart ?? value.length
                const newValue = autocomplete.insertSelected(value, cursorPos)
                if (newValue !== null) {
                  setValue(newValue)
                }
                textarea?.focus()
              }}
            />
          )}
          {showAtMention && (
            <MentionDropdown
              results={atMention.results}
              selectedIndex={atMention.selectedIndex}
              query={atMention.query}
              onSelect={(result) => {
                const textarea = textareaRef.current
                const cursorPos = textarea?.selectionStart ?? value.length
                const newValue = atMention.insertMention(result, value, cursorPos)
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
              isDisabled ? 'Conectando...' : 'Digite sua mensagem... (@ arquivo, /use-skill nome)'
            }
            disabled={isDisabled}
            rows={1}
          />
        </div>
      )}
    </div>
  )
}
