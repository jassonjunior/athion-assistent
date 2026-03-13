/**
 * useInputAutocomplete
 * Descrição: Hook de autocomplete sem LLM para o Desktop (Tauri).
 * Detecta dois padrões:
 *  1. `/use-skill <prefix>` -> lista skills via skillList()
 *  2. `@<prefix>` -> lista arquivos via filesList()
 * Usa Tauri bridge para ambas as fontes de dados.
 */

import { useCallback, useRef, useState } from 'react'
import * as bridge from '../bridge/tauri-bridge.js'
import type { SkillInfo } from '../bridge/tauri-bridge.js'

/** AutocompleteItem
 * Descrição: Representa um item individual no dropdown de autocomplete
 */
export interface AutocompleteItem {
  /** Texto exibido no dropdown */
  label: string
  /** Descrição opcional exibida abaixo do label */
  description?: string
  /** Texto completo a inserir quando o item é selecionado */
  insertValue: string
}

/** UseInputAutocompleteReturn
 * Descrição: Interface de retorno do hook useInputAutocomplete com estado e ações
 */
export interface UseInputAutocompleteReturn {
  /** Indica se o dropdown de autocomplete está visível */
  isOpen: boolean
  /** Lista de itens disponíveis no dropdown */
  items: AutocompleteItem[]
  /** Índice do item atualmente selecionado */
  selectedIndex: number
  /** Modo atual do autocomplete (skill, file ou nenhum) */
  mode: 'skill' | 'file' | null
  /** Callback para processar mudanças no texto de entrada */
  handleChange: (value: string, cursorPos: number) => void
  /** Callback para processar teclas pressionadas (retorna true se consumiu o evento) */
  handleKeyDown: (e: React.KeyboardEvent) => boolean
  /** Insere o item selecionado no texto atual e retorna o novo valor */
  insertSelected: (currentValue: string, cursorPos: number) => string | null
  /** Fecha o dropdown de autocomplete */
  close: () => void
}

/** SKILL_PATTERN
 * Descrição: Expressão regular para detectar o padrão /use-skill seguido de um prefixo
 */
const SKILL_PATTERN = /^\/use-skill\s+(\S*)$/

/** FILE_PATTERN
 * Descrição: Expressão regular para detectar o padrão @prefixo para autocomplete de arquivos
 */
const FILE_PATTERN = /@(\S*)$/

/** useInputAutocomplete
 * Descrição: Hook que gerencia o estado e lógica de autocomplete para skills e arquivos no campo de entrada
 * @returns Objeto com estado do autocomplete (isOpen, items, selectedIndex, mode) e ações (handleChange, handleKeyDown, insertSelected, close)
 */
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

  /** close
   * Descrição: Fecha o dropdown de autocomplete e reseta o estado interno
   */
  const close = useCallback(() => {
    setIsOpen(false)
    setItems([])
    setSelectedIndex(0)
    setMode(null)
    atStartRef.current = -1
    lastFilePrefixRef.current = null
  }, [])

  /** loadSkills
   * Descrição: Carrega a lista de skills do sidecar via bridge (lazy loading, executado apenas uma vez)
   */
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

  /** handleChange
   * Descrição: Analisa o texto digitado e posição do cursor para detectar padrões de autocomplete e atualizar a lista de sugestões
   * @param value - Valor atual do campo de texto
   * @param cursorPos - Posição atual do cursor
   */
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

  /** handleKeyDown
   * Descrição: Processa navegação por teclado no dropdown (ArrowUp/Down, Escape, Tab, Enter)
   * @param e - Evento de teclado
   * @returns true se o evento foi consumido pelo autocomplete, false caso contrário
   */
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

  /** insertSelected
   * Descrição: Insere o item atualmente selecionado no texto, substituindo o padrão de trigger
   * @param currentValue - Valor atual do campo de texto
   * @param cursorPos - Posição atual do cursor
   * @returns Novo valor do campo com o item inserido, ou null se não houver item selecionado
   */
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
