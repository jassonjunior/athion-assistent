/**
 * InputArea
 * Descrição: Campo de entrada do chat com command picker, submenus e autocomplete.
 * Fluxo: `/` abre command picker, `/skills` abre submenu, `@` abre autocomplete de arquivos.
 */

import { useCallback, useRef, useState } from 'react'
import { useAtMention } from '../hooks/useAtMention.js'
import { useInputAutocomplete } from '../hooks/useInputAutocomplete.js'
import { MentionDropdown } from './MentionDropdown.js'
import { AutocompleteDropdown } from './AutocompleteDropdown.js'
import { t } from '@athion/shared'

/**
 * InputAreaProps
 * Descrição: Props do componente InputArea.
 */
interface InputAreaProps {
  /** Callback chamado ao submeter uma mensagem */
  onSubmit: (content: string) => void
  /** Callback chamado ao abortar o streaming */
  onAbort: () => void
  /** Indica se está em modo de streaming (desabilita envio) */
  isStreaming: boolean
  /** Indica se o input está desabilitado (core não está pronto) */
  isDisabled: boolean
}

/**
 * InputArea
 * Descrição: Componente de área de entrada que integra textarea, command picker,
 * autocomplete de arquivos e dropdown de menções.
 * @param onSubmit - Callback de submissão de mensagem
 * @param onAbort - Callback de abort do streaming
 * @param isStreaming - Flag de streaming ativo
 * @param isDisabled - Flag de input desabilitado
 * @returns Elemento JSX da área de entrada
 */
export function InputArea({ onSubmit, onAbort, isStreaming, isDisabled }: InputAreaProps) {
  const [value, setValue] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const autocomplete = useInputAutocomplete()
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

  /** Lida com seleção de item do autocomplete/menu (teclado ou mouse) */
  const handleAutocompleteSelect = useCallback(
    (cursorPos: number) => {
      const newValue = autocomplete.insertSelected(value, cursorPos)
      if (newValue === null) return

      if (autocomplete.shouldSubmitOnInsert(newValue)) {
        submit(newValue)
      } else {
        // Comando com args (ex: /use-skill , /codebase-search ) → coloca no input
        setValue(newValue)
        // Dispara handleChange para que o submenu seja atualizado imediatamente
        autocomplete.handleChange(newValue, newValue.length)
        requestAnimationFrame(() => {
          const textarea = textareaRef.current
          if (textarea) textarea.setSelectionRange(newValue.length, newValue.length)
          textarea?.focus()
        })
      }
    },
    [autocomplete, value, submit],
  )

  const handleKeyDownCombined = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current
      const cursorPos = textarea?.selectionStart ?? value.length

      // 1. Menu/autocomplete tem prioridade sobre Enter
      const acConsumed = autocomplete.handleKeyDown(e)
      if (acConsumed) {
        if (e.key === 'Tab' || e.key === 'Enter') {
          handleAutocompleteSelect(cursorPos)
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
    [autocomplete, atMention, value, submit, handleAutocompleteSelect],
  )

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      const cursorPos = e.target.selectionStart ?? newValue.length
      setValue(newValue)
      autocomplete.handleChange(newValue, cursorPos)
      atMention.handleChange(newValue, cursorPos)
      // Auto-resize
      const textarea = e.target
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    },
    [autocomplete, atMention],
  )

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
              onSelect={() => {
                const cursorPos = textareaRef.current?.selectionStart ?? value.length
                handleAutocompleteSelect(cursorPos)
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
              isDisabled ? t('vscode.ui.placeholder_disabled') : t('vscode.ui.placeholder')
            }
            disabled={isDisabled}
            rows={1}
          />
        </div>
      )}
    </div>
  )
}
