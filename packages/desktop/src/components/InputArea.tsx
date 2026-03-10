/**
 * InputArea — Campo de entrada com Enter para enviar.
 */

import { useCallback, useRef, useState } from 'react'

interface InputAreaProps {
  onSubmit: (content: string) => void
  onAbort: () => void
  isStreaming: boolean
  isDisabled: boolean
  /** Valor inicial do campo (ex: mensagem injetada via deep link). */
  initialValue?: string
}

export function InputArea({
  onSubmit,
  onAbort,
  isStreaming,
  isDisabled,
  initialValue,
}: InputAreaProps) {
  const [value, setValue] = useState(initialValue ?? '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        if (value.trim() && !isStreaming && !isDisabled) {
          onSubmit(value.trim())
          setValue('')
          if (textareaRef.current) textareaRef.current.style.height = 'auto'
        }
      }
    },
    [value, isStreaming, isDisabled, onSubmit],
  )

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value)
    const textarea = e.target
    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
  }, [])

  return (
    <div className="border-t border-surface-800 bg-surface-950 p-3">
      {isStreaming ? (
        <button
          onClick={onAbort}
          className="w-full rounded-lg bg-error-500/20 px-4 py-2 text-sm text-error-500 transition-colors hover:bg-error-500/30"
        >
          Parar geração
        </button>
      ) : (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={
            isDisabled ? 'Conectando ao core...' : 'Digite sua mensagem... (Enter para enviar)'
          }
          disabled={isDisabled}
          rows={1}
          className="w-full resize-none rounded-lg border border-surface-700 bg-surface-900 px-4 py-2.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-accent-500 disabled:opacity-50"
        />
      )}
    </div>
  )
}
