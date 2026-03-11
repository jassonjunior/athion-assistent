/**
 * useInputAutocomplete — Autocomplete sem LLM para o InputArea (VSCode webview).
 *
 * Detecta dois padrões no texto:
 *  1. `/use-skill <prefix>` → lista skills filtradas por prefix
 *  2. `@<prefix>` (já tratado por useAtMention, mas aqui: sem codebase indexer)
 *     → lista arquivos via files:list message
 *
 * Comunicação com extensão:
 *  - `skill:list` → `skill:list:result`   (carrega skills uma vez)
 *  - `files:list` → `files:list:result`  (lazy, por prefix)
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMessenger } from './useMessenger.js'
import type { SkillInfo } from '../../../bridge/messenger-types.js'

export interface AutocompleteItem {
  label: string
  description?: string
  /** Texto completo a inserir no campo quando selecionado */
  insertValue: string
}

export interface UseInputAutocompleteReturn {
  isOpen: boolean
  items: AutocompleteItem[]
  selectedIndex: number
  /** Tipo do autocomplete ativo */
  mode: 'skill' | 'file' | null
  /** Chama a cada mudança de valor + posição do cursor */
  handleChange: (value: string, cursorPos: number) => void
  /** Intercepta teclado. Retorna true se consumiu o evento. */
  handleKeyDown: (e: React.KeyboardEvent) => boolean
  /** Retorna o novo valor do campo após inserção da sugestão selecionada */
  insertSelected: (currentValue: string, cursorPos: number) => string | null
  close: () => void
}

const SKILL_PATTERN = /^\/use-skill\s+(\S*)$/
const FILE_PATTERN = /@(\S*)$/

export function useInputAutocomplete(): UseInputAutocompleteReturn {
  const { post, on } = useMessenger()

  const [isOpen, setIsOpen] = useState(false)
  const [items, setItems] = useState<AutocompleteItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mode, setMode] = useState<'skill' | 'file' | null>(null)

  // Skills carregadas (lazy, uma vez só)
  const skillsRef = useRef<SkillInfo[]>([])
  const skillsLoadedRef = useRef(false)
  // Guarda posição do @ para substituição
  const atStartRef = useRef<number>(-1)
  // Último prefix de arquivo buscado
  const lastFilePrefixRef = useRef<string | null>(null)

  // ── Listeners ──────────────────────────────────────────────────────

  useEffect(() => {
    on('skill:list:result', (d: unknown) => {
      const { skills } = d as { skills: SkillInfo[] }
      skillsRef.current = skills
      skillsLoadedRef.current = true
      // Se autocomplete de skill está aberto, re-filtra
      setItems((prev) => {
        if (prev.length === 0) return prev
        return prev // will be recalculated by handleChange
      })
    })

    on('files:list:result', (d: unknown) => {
      const { files, prefix } = d as { files: string[]; prefix: string }
      // Só aplica se ainda estamos esperando por esse prefix
      if (prefix !== lastFilePrefixRef.current) return
      const mapped: AutocompleteItem[] = files.map((f) => ({
        label: '@' + f,
        insertValue: f, // será combinado com o texto antes do @
      }))
      setItems(mapped)
      setSelectedIndex(0)
      setIsOpen(mapped.length > 0)
    })
  }, [on])

  // ── Helpers ────────────────────────────────────────────────────────

  function loadSkills() {
    if (!skillsLoadedRef.current) {
      post({ type: 'skill:list' })
    }
  }

  const close = useCallback(() => {
    setIsOpen(false)
    setItems([])
    setSelectedIndex(0)
    setMode(null)
    atStartRef.current = -1
    lastFilePrefixRef.current = null
  }, [])

  // ── handleChange ───────────────────────────────────────────────────

  const handleChange = useCallback(
    (value: string, cursorPos: number) => {
      const textBeforeCursor = value.slice(0, cursorPos)

      // 1. /use-skill <prefix>
      const skillMatch = SKILL_PATTERN.exec(value)
      if (skillMatch) {
        loadSkills()
        const prefix = (skillMatch[1] ?? '').toLowerCase()
        const filtered = skillsRef.current
          .filter((s) => !prefix || s.name.toLowerCase().startsWith(prefix))
          .slice(0, 8)
          .map(
            (s): AutocompleteItem => ({
              label: s.name,
              description: s.description,
              insertValue: `/use-skill ${s.name}`,
            }),
          )
        setItems(filtered)
        setSelectedIndex(0)
        setIsOpen(filtered.length > 0)
        setMode('skill')
        return
      }

      // 2. @prefix em qualquer posição
      const fileMatch = FILE_PATTERN.exec(textBeforeCursor)
      if (fileMatch) {
        const rawPrefix = fileMatch[1] ?? ''
        const atPos = cursorPos - fileMatch[0].length
        atStartRef.current = atPos
        setMode('file')

        if (rawPrefix !== lastFilePrefixRef.current) {
          lastFilePrefixRef.current = rawPrefix
          // Fecha temporariamente enquanto carrega
          setItems([])
          setIsOpen(false)
          post({ type: 'files:list', prefix: rawPrefix })
        }
        return
      }

      // Nenhum padrão → fecha
      if (isOpen) close()
    },
    [isOpen, close, post],
  )

  // ── handleKeyDown ──────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!isOpen || items.length === 0) return false

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1))
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
        const item = items[selectedIndex]
        if (item) {
          e.preventDefault()
          return true // caller chama insertSelected
        }
      }
      return false
    },
    [isOpen, items, selectedIndex, close],
  )

  // ── insertSelected ─────────────────────────────────────────────────

  const insertSelected = useCallback(
    (currentValue: string, cursorPos: number): string | null => {
      const item = items[selectedIndex]
      if (!item) return null

      close()

      if (mode === 'skill') {
        // /use-skill está sempre na linha toda → substitui tudo
        return item.insertValue
      }

      if (mode === 'file') {
        // Substitui desde o @ até o cursor
        const start = atStartRef.current
        if (start === -1) return null
        const before = currentValue.slice(0, start)
        const after = currentValue.slice(cursorPos)
        return `${before}@${item.insertValue} ${after}`
      }

      return null
    },
    [items, selectedIndex, mode, close],
  )

  return {
    isOpen,
    items,
    selectedIndex,
    mode,
    handleChange,
    handleKeyDown,
    insertSelected,
    close,
  }
}
