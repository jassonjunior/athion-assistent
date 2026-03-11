/**
 * useInputAutocomplete — Autocomplete sem LLM para o Desktop (Tauri).
 *
 * Detecta dois padrões:
 *  1. `/use-skill <prefix>` → lista skills via skillList()
 *  2. `@<prefix>` → lista arquivos via filesList()
 *
 * Usa Tauri bridge para ambas as fontes.
 */

import { useCallback, useRef, useState } from 'react'
import * as bridge from '../bridge/tauri-bridge.js'
import type { SkillInfo } from '../bridge/tauri-bridge.js'

export interface AutocompleteItem {
  label: string
  description?: string
  /** Texto completo a inserir quando selecionado */
  insertValue: string
}

export interface UseInputAutocompleteReturn {
  isOpen: boolean
  items: AutocompleteItem[]
  selectedIndex: number
  mode: 'skill' | 'file' | null
  handleChange: (value: string, cursorPos: number) => void
  handleKeyDown: (e: React.KeyboardEvent) => boolean
  insertSelected: (currentValue: string, cursorPos: number) => string | null
  close: () => void
}

const SKILL_PATTERN = /^\/use-skill\s+(\S*)$/
const FILE_PATTERN = /@(\S*)$/

export function useInputAutocomplete(): UseInputAutocompleteReturn {
  const [isOpen, setIsOpen] = useState(false)
  const [items, setItems] = useState<AutocompleteItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mode, setMode] = useState<'skill' | 'file' | null>(null)

  // Skills carregadas (lazy)
  const skillsRef = useRef<SkillInfo[]>([])
  const skillsLoadedRef = useRef(false)
  // Posição do @ para substituição
  const atStartRef = useRef<number>(-1)
  // Debounce para busca de arquivos
  const fileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastFilePrefixRef = useRef<string | null>(null)

  const close = useCallback(() => {
    setIsOpen(false)
    setItems([])
    setSelectedIndex(0)
    setMode(null)
    atStartRef.current = -1
    lastFilePrefixRef.current = null
  }, [])

  async function loadSkills() {
    if (skillsLoadedRef.current) return
    try {
      const skills = await bridge.skillList()
      skillsRef.current = skills
      skillsLoadedRef.current = true
    } catch {
      // silencioso
    }
  }

  const handleChange = useCallback(
    (value: string, cursorPos: number) => {
      const textBeforeCursor = value.slice(0, cursorPos)

      // 1. /use-skill <prefix>
      const skillMatch = SKILL_PATTERN.exec(value)
      if (skillMatch) {
        const prefix = (skillMatch[1] ?? '').toLowerCase()
        const applyFilter = () => {
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
        }

        if (!skillsLoadedRef.current) {
          loadSkills().then(applyFilter)
        } else {
          applyFilter()
        }
        return
      }

      // 2. @prefix
      const fileMatch = FILE_PATTERN.exec(textBeforeCursor)
      if (fileMatch) {
        const rawPrefix = fileMatch[1] ?? ''
        const atPos = cursorPos - fileMatch[0].length
        atStartRef.current = atPos
        setMode('file')

        if (rawPrefix === lastFilePrefixRef.current) return
        lastFilePrefixRef.current = rawPrefix

        // Debounce 150ms
        if (fileTimerRef.current) clearTimeout(fileTimerRef.current)
        fileTimerRef.current = setTimeout(async () => {
          try {
            const { files } = await bridge.filesList(rawPrefix)
            if (rawPrefix !== lastFilePrefixRef.current) return // stale
            const mapped: AutocompleteItem[] = files.map((f) => ({
              label: '@' + f,
              insertValue: f,
            }))
            setItems(mapped)
            setSelectedIndex(0)
            setIsOpen(mapped.length > 0)
          } catch {
            setIsOpen(false)
          }
        }, 150)
        return
      }

      // Nenhum padrão
      if (isOpen) close()
    },
    [isOpen, close],
  )

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
          return true
        }
      }
      return false
    },
    [isOpen, items, selectedIndex, close],
  )

  const insertSelected = useCallback(
    (currentValue: string, cursorPos: number): string | null => {
      const item = items[selectedIndex]
      if (!item) return null

      close()

      if (mode === 'skill') {
        return item.insertValue
      }

      if (mode === 'file') {
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
