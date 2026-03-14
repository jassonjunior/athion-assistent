/**
 * InputArea
 * Descrição: Campo de entrada de texto com autocomplete de /use-skill e @arquivo.
 * Dropdown estilizado com Tailwind (tema dark nativo do desktop).
 * Sem LLM: prefix matching puro via bridge.skillList() e bridge.filesList().
 */

import { useCallback, useRef, useState } from 'react'
import { useInputAutocomplete } from '../hooks/useInputAutocomplete.js'
import type { AutocompleteItem } from '../hooks/useInputAutocomplete.js'

/** InputAreaProps
 * Descrição: Propriedades do componente InputArea
 */
interface InputAreaProps {
  /** Callback disparado ao enviar uma mensagem */
  onSubmit: (content: string) => void
  /** Callback para abortar a geração em andamento */
  onAbort: () => void
  /** Indica se o assistente está gerando uma resposta */
  isStreaming: boolean
  /** Indica se o campo de entrada está desabilitado (ex: sidecar não conectado) */
  isDisabled: boolean
  /** Valor inicial do campo (ex: mensagem injetada via deep link) */
  initialValue?: string
}

/** InputArea
 * Descrição: Componente de entrada de texto com textarea expansível, autocomplete de skills/arquivos e botão de abort
 * @param onSubmit - Callback para enviar mensagem
 * @param onAbort - Callback para abortar geração
 * @param isStreaming - Estado de streaming do assistente
 * @param isDisabled - Estado de desabilitação do campo
 * @param initialValue - Valor inicial opcional
 * @returns Elemento JSX do campo de entrada com autocomplete
 */
export function InputArea({
  onSubmit,
  onAbort,
  isStreaming,
  isDisabled,
  initialValue,
}: InputAreaProps) {
  const [value, setValue] = useState(initialValue ?? '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const autocomplete = useInputAutocomplete()

  /** submit
   * Descrição: Submete o texto do campo, limpa o valor e fecha o autocomplete
   * @param text - Texto a ser submetido
   */
  const submit = useCallback(
    (text: string) => {
      if (!text.trim() || isStreaming || isDisabled) return
      onSubmit(text.trim())
      setValue('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      autocomplete.close()
    },
    [isStreaming, isDisabled, onSubmit, autocomplete],
  )

  /** handleKeyDown
   * Descrição: Processa teclas pressionadas, delegando ao autocomplete ou submetendo com Enter
   * @param e - Evento de teclado do textarea
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current
      const cursorPos = textarea?.selectionStart ?? value.length

      // Autocomplete tem prioridade
      const consumed = autocomplete.handleKeyDown(e)
      if (consumed) {
        if (e.key === 'Tab' || e.key === 'Enter') {
          const newValue = autocomplete.insertSelected(value, cursorPos)
          if (newValue !== null) {
            setValue(newValue)
            requestAnimationFrame(() => {
              if (textarea) textarea.setSelectionRange(newValue.length, newValue.length)
            })
          }
        }
        return
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        submit(value)
      }
    },
    [autocomplete, value, submit],
  )

  /** handleInput
   * Descrição: Processa mudanças no campo de texto, atualizando valor, autocomplete e altura do textarea
   * @param e - Evento de mudança do textarea
   */
  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      const cursorPos = e.target.selectionStart ?? newValue.length
      setValue(newValue)
      autocomplete.handleChange(newValue, cursorPos)
      // Auto-resize
      const textarea = e.target
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`
    },
    [autocomplete],
  )

  /** selectItem
   * Descrição: Seleciona um item do dropdown de autocomplete e insere no campo de texto
   * @param _item - Item de autocomplete selecionado
   */
  function selectItem(_item: AutocompleteItem) {
    const textarea = textareaRef.current
    const cursorPos = textarea?.selectionStart ?? value.length
    const newValue = autocomplete.insertSelected(value, cursorPos)
    if (newValue !== null) setValue(newValue)
    textarea?.focus()
  }

  /** header
   * Descrição: Título do dropdown de autocomplete baseado no modo atual (skill ou file)
   */
  const header = autocomplete.mode === 'skill' ? 'Skills disponíveis' : 'Arquivos'

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
        <div className="relative">
          {/* Autocomplete dropdown */}
          {autocomplete.isOpen && autocomplete.items.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-1 max-h-60 overflow-y-auto rounded-lg border border-surface-700 bg-surface-900 shadow-lg z-10">
              <div className="px-3 py-1 text-xs text-neutral-500 border-b border-surface-700 uppercase tracking-wider">
                {header}
              </div>
              {autocomplete.items.map((item, i) => (
                <button
                  key={item.label}
                  className={`flex w-full flex-col px-3 py-2 text-left text-sm transition-colors ${
                    i === autocomplete.selectedIndex
                      ? 'bg-accent-500/20 text-accent-400'
                      : 'text-neutral-300 hover:bg-surface-800'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectItem(item)
                  }}
                >
                  <span className="font-medium">{item.label}</span>
                  {item.description && (
                    <span className="text-xs text-neutral-500 truncate">{item.description}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={
              isDisabled
                ? 'Conectando ao core...'
                : 'Digite sua mensagem... (@ arquivo, /use-skill nome)'
            }
            disabled={isDisabled}
            rows={1}
            className="w-full resize-none rounded-lg border border-surface-700 bg-surface-900 px-4 py-2.5 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-accent-500 disabled:opacity-50"
          />
        </div>
      )}
    </div>
  )
}
