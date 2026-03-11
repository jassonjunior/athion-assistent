/**
 * useInputAutocomplete — Autocomplete com navegação em menu/submenu.
 *
 * Fluxo de navegação:
 *  1. `/prefix`           → command picker (lista todos os comandos)
 *  2. `/skills <filter>`  → skills browser (lista skills, filtra em tempo real)
 *  3. `/use-skill <pre>`  → autocomplete de skill por nome
 *  4. `@<prefix>`         → autocomplete de arquivo
 *
 * Seleção no skills-browser executa `/use-skill <nome>` diretamente.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMessenger } from './useMessenger.js'
import type { SkillInfo } from '../../../bridge/messenger-types.js'

export interface AutocompleteItem {
  label: string
  description?: string
  /** Texto completo a inserir/submeter quando selecionado */
  insertValue: string
  /** Quando true, não adiciona espaço no final ao inserir */
  noTrailingSpace?: boolean
  /** Badge exibido à direita do label (ex: "ativar") */
  badge?: string
}

export type AutocompleteMode = 'command' | 'skills-browser' | 'skill' | 'file' | null

export interface UseInputAutocompleteReturn {
  isOpen: boolean
  items: AutocompleteItem[]
  selectedIndex: number
  mode: AutocompleteMode
  handleChange: (value: string, cursorPos: number) => void
  handleKeyDown: (e: React.KeyboardEvent) => boolean
  insertSelected: (currentValue: string, cursorPos: number) => string | null
  /** true quando a seleção deve ser submetida imediatamente (sem outro Enter) */
  shouldSubmitOnInsert: (newValue: string) => boolean
  close: () => void
}

// ── Definição dos slash commands ────────────────────────────────────────────

interface SlashCommand {
  name: string
  description: string
  hasArgs?: boolean
  /** Se true, ao selecionar abre um submenu em vez de executar */
  hasSubmenu?: boolean
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/clear', description: 'Limpar mensagens' },
  { name: '/help', description: 'Mostrar ajuda e comandos disponíveis' },
  { name: '/agents', description: 'Listar agentes disponíveis' },
  {
    name: '/skills',
    description: 'Navegar e ativar skills instaladas',
    hasSubmenu: true,
    hasArgs: true,
  },
  { name: '/use-skill', description: 'Ativar skill pelo nome', hasArgs: true },
  { name: '/clear-skill', description: 'Desativar skill ativa' },
  { name: '/find-skills', description: 'Buscar skills no registry', hasArgs: true },
  { name: '/install-skill', description: 'Instalar skill do registry', hasArgs: true },
  { name: '/model', description: 'Mostrar modelo e provider atuais' },
  { name: '/codebase-index', description: 'Indexar o workspace atual' },
  { name: '/codebase-search', description: 'Buscar semanticamente no código', hasArgs: true },
]

// ── Padrões de detecção (ordem importa) ────────────────────────────────────

/** /use-skill <prefix> — com espaço obrigatório */
const USE_SKILL_PATTERN = /^\/use-skill\s+(\S*)$/
/** /skills <filter> — com espaço (submenu de skills) */
const SKILLS_BROWSE_PATTERN = /^\/skills\s(.*)$/
/** Qualquer /comando sem espaço */
const SLASH_PATTERN = /^(\/\S*)$/
/** @arquivo */
const FILE_PATTERN = /@(\S*)$/

/** Função pura — pode ser chamada de dentro de closures/listeners sem deps de hook */
function buildSkillItemsFrom(skills: SkillInfo[], filter: string): AutocompleteItem[] {
  const f = filter.toLowerCase()
  return skills
    .filter(
      (s) => !f || s.name.toLowerCase().includes(f) || s.description.toLowerCase().includes(f),
    )
    .slice(0, 12)
    .map(
      (s): AutocompleteItem => ({
        label: s.name,
        description: s.description,
        insertValue: `/use-skill ${s.name}`,
        noTrailingSpace: true,
        badge: 'ativar',
      }),
    )
}

export function useInputAutocomplete(): UseInputAutocompleteReturn {
  const { post, on } = useMessenger()

  const [isOpen, setIsOpen] = useState(false)
  const [items, setItems] = useState<AutocompleteItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [mode, setMode] = useState<AutocompleteMode>(null)

  const skillsRef = useRef<SkillInfo[]>([])
  const skillsLoadedRef = useRef(false)
  const atStartRef = useRef<number>(-1)
  const lastFilePrefixRef = useRef<string | null>(null)
  /** Guarda o filtro atual quando estamos no skills-browser, para re-renderizar ao receber skills */
  const skillsBrowserFilterRef = useRef<string | null>(null)

  // ── Listeners ───────────────────────────────────────────────────────────

  useEffect(() => {
    on('skill:list:result', (d: unknown) => {
      const { skills } = d as { skills: SkillInfo[] }
      skillsRef.current = skills
      skillsLoadedRef.current = true
      // Se o skills-browser estava aguardando os dados, re-renderiza com o filtro atual
      if (skillsBrowserFilterRef.current !== null) {
        const filtered = buildSkillItemsFrom(skills, skillsBrowserFilterRef.current)
        setItems(filtered)
        setSelectedIndex(0)
        setIsOpen(true)
      }
    })

    on('files:list:result', (d: unknown) => {
      const { files, prefix } = d as { files: string[]; prefix: string }
      if (prefix !== lastFilePrefixRef.current) return
      const mapped: AutocompleteItem[] = files.map((f) => ({
        label: '@' + f,
        insertValue: f,
      }))
      setItems(mapped)
      setSelectedIndex(0)
      setIsOpen(mapped.length > 0)
    })
  }, [on])

  // ── Helpers ─────────────────────────────────────────────────────────────

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
    skillsBrowserFilterRef.current = null
  }, [])

  function buildSkillItems(filter: string): AutocompleteItem[] {
    return buildSkillItemsFrom(skillsRef.current, filter)
  }

  // ── handleChange ────────────────────────────────────────────────────────

  const handleChange = useCallback(
    (value: string, cursorPos: number) => {
      const textBeforeCursor = value.slice(0, cursorPos)

      // 1. /use-skill <prefix> — autocomplete de skill por nome
      const useSkillMatch = USE_SKILL_PATTERN.exec(value)
      if (useSkillMatch) {
        loadSkills()
        const prefix = (useSkillMatch[1] ?? '').toLowerCase()
        const filtered = skillsRef.current
          .filter((s) => !prefix || s.name.toLowerCase().startsWith(prefix))
          .slice(0, 8)
          .map(
            (s): AutocompleteItem => ({
              label: s.name,
              description: s.description,
              insertValue: `/use-skill ${s.name}`,
              noTrailingSpace: true,
              badge: 'ativar',
            }),
          )
        setItems(filtered)
        setSelectedIndex(0)
        setIsOpen(filtered.length > 0)
        setMode('skill')
        return
      }

      // 2. /skills <filter> — submenu de skills instaladas
      const skillsBrowseMatch = SKILLS_BROWSE_PATTERN.exec(value)
      if (skillsBrowseMatch) {
        loadSkills()
        const filter = skillsBrowseMatch[1] ?? ''
        // Salva o filtro atual para re-renderizar quando as skills chegarem via bridge
        skillsBrowserFilterRef.current = filter
        const filtered = buildSkillItems(filter)
        setItems(filtered)
        setSelectedIndex(0)
        setIsOpen(true) // abre mesmo se lista vazia (mostra "carregando")
        setMode('skills-browser')
        return
      }

      // 3. /comando — command picker
      const slashMatch = SLASH_PATTERN.exec(value)
      if (slashMatch) {
        const typed = (slashMatch[1] ?? '').toLowerCase()
        const filtered = SLASH_COMMANDS.filter((cmd) => cmd.name.toLowerCase().startsWith(typed))
          .slice(0, 12)
          .map(
            (cmd): AutocompleteItem => ({
              label: cmd.name,
              description: cmd.description,
              // Comandos com submenu ou args ganham espaço → abre submenu automaticamente
              insertValue: cmd.hasArgs || cmd.hasSubmenu ? `${cmd.name} ` : cmd.name,
              noTrailingSpace: !cmd.hasArgs && !cmd.hasSubmenu,
              badge: cmd.hasSubmenu ? '→' : undefined,
            }),
          )
        setItems(filtered)
        setSelectedIndex(0)
        setIsOpen(filtered.length > 0)
        setMode('command')
        return
      }

      // 4. @prefix — autocomplete de arquivo
      const fileMatch = FILE_PATTERN.exec(textBeforeCursor)
      if (fileMatch) {
        const rawPrefix = fileMatch[1] ?? ''
        const atPos = cursorPos - fileMatch[0].length
        atStartRef.current = atPos
        setMode('file')

        if (rawPrefix !== lastFilePrefixRef.current) {
          lastFilePrefixRef.current = rawPrefix
          setItems([])
          setIsOpen(false)
          post({ type: 'files:list', prefix: rawPrefix })
        }
        return
      }

      if (isOpen) close()
    },
    [isOpen, close, post],
  )

  // ── handleKeyDown ────────────────────────────────────────────────────────

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

  // ── shouldSubmitOnInsert ─────────────────────────────────────────────────

  const shouldSubmitOnInsert = useCallback(
    (newValue: string): boolean => {
      // No modo skills-browser ou command, se não termina com espaço → submete
      if (mode === 'skills-browser') return true
      if (mode === 'command' || mode === 'skill') return !newValue.endsWith(' ')
      return false
    },
    [mode],
  )

  // ── insertSelected ───────────────────────────────────────────────────────

  const insertSelected = useCallback(
    (currentValue: string, cursorPos: number): string | null => {
      const item = items[selectedIndex]
      if (!item) return null

      close()

      if (mode === 'command' || mode === 'skills-browser' || mode === 'skill') {
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
    shouldSubmitOnInsert,
    close,
  }
}
