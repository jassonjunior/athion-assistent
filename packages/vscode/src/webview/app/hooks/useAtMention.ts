/**
 * useAtMention — Detecta `@` no input e busca arquivos/símbolos via codebase indexer.
 *
 * Fluxo:
 *  1. Usuário digita `@` → detecta padrão /@(\w*)$/
 *  2. Posta `mention:search` para a extensão com a query
 *  3. Extensão responde com `mention:results`
 *  4. MentionDropdown renderiza resultados
 *  5. Seleção insere `@file:line` no textarea
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMessenger } from './useMessenger.js'
import type { MentionResult } from '../../../bridge/messenger-types.js'

export type { MentionResult }

const AT_PATTERN = /@(\w[\w./\\-]*)$/

export interface UseAtMentionReturn {
  isOpen: boolean
  results: MentionResult[]
  query: string
  selectedIndex: number
  /** Chama quando o valor do textarea muda. Detecta padrão @. */
  handleChange: (value: string, cursorPos: number) => void
  /** Intercepta teclas no textarea. Retorna true se o evento foi consumido. */
  handleKeyDown: (e: React.KeyboardEvent) => boolean
  /** Insere a menção no texto e retorna o novo valor. */
  insertMention: (result: MentionResult, currentValue: string, cursorPos: number) => string
  close: () => void
}

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
