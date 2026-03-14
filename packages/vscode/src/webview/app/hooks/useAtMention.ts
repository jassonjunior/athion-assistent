/**
 * useAtMention
 * Descrição: Hook que detecta `@` no input e busca arquivos/simbolos via codebase indexer.
 * Fluxo: Usuário digita `@` -> detecta padrão -> posta `mention:search` -> recebe resultados ->
 * MentionDropdown renderiza -> seleção insere `@file:line` no textarea.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMessenger } from './useMessenger.js'
import type { MentionResult } from '../../../bridge/messenger-types.js'

export type { MentionResult }

/** AT_PATTERN - Regex para detectar padrão de @mention no texto antes do cursor */
const AT_PATTERN = /@(\w[\w./\\-]*)$/

/**
 * UseAtMentionReturn
 * Descrição: Tipo de retorno do hook useAtMention com estado e métodos de controle.
 */
export interface UseAtMentionReturn {
  /** Indica se o dropdown de menções está aberto */
  isOpen: boolean
  /** Resultados de busca de menção */
  results: MentionResult[]
  /** Query atual de busca (texto após @) */
  query: string
  /** Índice do item selecionado no dropdown */
  selectedIndex: number
  /**
   * handleChange
   * Descrição: Chamado quando o valor do textarea muda. Detecta padrão @.
   * @param value - Valor atual do textarea
   * @param cursorPos - Posição do cursor
   */
  handleChange: (value: string, cursorPos: number) => void
  /**
   * handleKeyDown
   * Descrição: Intercepta teclas no textarea para navegação no dropdown.
   * @param e - Evento de teclado
   * @returns true se o evento foi consumido
   */
  handleKeyDown: (e: React.KeyboardEvent) => boolean
  /**
   * insertMention
   * Descrição: Insere a menção selecionada no texto e retorna o novo valor.
   * @param result - Resultado selecionado
   * @param currentValue - Valor atual do textarea
   * @param cursorPos - Posição do cursor
   * @returns Novo valor do textarea com a menção inserida
   */
  insertMention: (result: MentionResult, currentValue: string, cursorPos: number) => string
  /** Fecha o dropdown de menções */
  close: () => void
}

/**
 * useAtMention
 * Descrição: Hook que gerencia a detecção de @mentions, busca de resultados e inserção no textarea.
 * @returns Objeto UseAtMentionReturn com estado e métodos de controle do dropdown de menções
 */
export function useAtMention(): UseAtMentionReturn {
  const { post, on } = useMessenger()
  const [isOpen, setIsOpen] = useState(false)
  const [results, setResults] = useState<MentionResult[]>([])
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Guarda a posição do início do @mention no texto (para substituição)
  const mentionStartRef = useRef<number>(-1)

  // Registra listener de resultados (apenas uma vez)
  useEffect(() => {
    on('mention:results', (d: unknown) => {
      const data = d as { results: MentionResult[]; query: string }
      setResults(data.results)
      setSelectedIndex(0)
      setIsOpen(data.results.length > 0)
    })
  }, [on])

  const close = useCallback(() => {
    setIsOpen(false)
    setResults([])
    setQuery('')
    setSelectedIndex(0)
    mentionStartRef.current = -1
  }, [])

  const handleChange = useCallback(
    (value: string, cursorPos: number) => {
      const textBeforeCursor = value.slice(0, cursorPos)
      const match = AT_PATTERN.exec(textBeforeCursor)

      if (match) {
        const q = match[1] ?? ''
        const start = cursorPos - match[0].length
        mentionStartRef.current = start
        setQuery(q)

        if (q.length >= 1) {
          post({ type: 'mention:search', query: q })
        } else {
          // '@' sozinho: busca vazia
          post({ type: 'mention:search', query: '' })
        }
      } else {
        if (isOpen) close()
      }
    },
    [isOpen, close, post],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!isOpen) return false

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1))
        return true
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
        return true
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return true
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        const selected = results[selectedIndex]
        if (selected) {
          e.preventDefault()
          return true // sinaliza para o InputArea chamar insertMention
        }
      }
      return false
    },
    [isOpen, results, selectedIndex, close],
  )

  const insertMention = useCallback(
    (result: MentionResult, currentValue: string, cursorPos: number): string => {
      const start = mentionStartRef.current
      if (start === -1) return currentValue

      const fileName = result.file.split('/').pop() ?? result.file
      const ref = result.symbolName
        ? `@${result.symbolName}(${fileName}:${result.startLine})`
        : `@${fileName}:${result.startLine}`

      const before = currentValue.slice(0, start)
      const after = currentValue.slice(cursorPos)
      close()
      return `${before}${ref} ${after}`
    },
    [close],
  )

  return {
    isOpen,
    results,
    query,
    selectedIndex,
    handleChange,
    handleKeyDown,
    insertMention,
    close,
  }
}
