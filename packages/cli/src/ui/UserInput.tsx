/**
 * UserInput — Campo de entrada de texto do usuário.
 *
 * Autocomplete em 3 contextos (sem LLM, baseado em prefix matching):
 *  1. `/`        → slash commands (lista estática)
 *  2. `/use-skill <prefix>` → skills carregadas (prefix match)
 *  3. `@<prefix>` → arquivos do workspace (glob async)
 *
 * Tab seleciona sugestão. Setas ↑↓ navegam.
 */

import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { useState, useMemo, useRef, useEffect } from 'react'
import type { SkillDefinition } from '@athion/core'
import type { Theme } from '../types.js'

interface UserInputProps {
  onSubmit: (content: string) => void
  isDisabled: boolean
  theme: Theme
  /** Skills carregadas para autocomplete de /use-skill */
  skills?: SkillDefinition[]
  /** Workspace raiz para glob de arquivos (@mentions) */
  workspacePath?: string
}

interface Suggestion {
  label: string
  description: string
  insert: string
}

const SLASH_COMMANDS: Suggestion[] = [
  { label: '/help', description: 'Mostrar todos os comandos', insert: '/help' },
  { label: '/clear', description: 'Limpar histórico de mensagens', insert: '/clear' },
  { label: '/agents', description: 'Listar agentes disponíveis', insert: '/agents' },
  { label: '/skills', description: 'Gerenciar skills instaladas', insert: '/skills' },
  {
    label: '/find-skills',
    description: 'Buscar e instalar novas skills: /find-skills [query]',
    insert: '/find-skills ',
  },
  { label: '/model', description: 'Mostrar modelo e provider', insert: '/model' },
  {
    label: '/use-skill',
    description: 'Ativar uma skill explicitamente: /use-skill <nome>',
    insert: '/use-skill ',
  },
  {
    label: '/clear-skill',
    description: 'Desativar a skill ativa',
    insert: '/clear-skill',
  },
  {
    label: '/install-skill',
    description: 'Instalar uma skill: /install-skill <nome>',
    insert: '/install-skill ',
  },
  {
    label: '/codebase-index',
    description: 'Indexar projeto para busca',
    insert: '/codebase-index',
  },
  {
    label: '/codebase-search',
    description: 'Buscar no código: /codebase-search <q>',
    insert: '/codebase-search ',
  },
]

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', '.next', 'build', 'coverage'])

async function searchFilesByPrefix(prefix: string, cwd: string, limit = 8): Promise<string[]> {
  const results: string[] = []
  try {
    // Path-aware: "@src/c" → glob "src/c*"
    // Filename-only: "@App" → glob "**/App*"
    const pattern = prefix.includes('/') ? `${prefix}*` : `**/*${prefix}*`
    const glob = new Bun.Glob(pattern)
    for await (const file of glob.scan({ cwd, onlyFiles: true })) {
      if (file.split('/').some((p) => IGNORED_DIRS.has(p))) continue
      results.push(file)
      if (results.length >= limit) break
    }
  } catch {
    // ignore (invalid pattern etc.)
  }
  return results
}

export function UserInput({ onSubmit, isDisabled, theme, skills, workspacePath }: UserInputProps) {
  const [value, setValue] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [inputKey, setInputKey] = useState(0)
  const [fileSuggestions, setFileSuggestions] = useState<Suggestion[]>([])
  /** Quando true, o dropdown está fechado pelo Esc (reset ao digitar). */
  const [dismissed, setDismissed] = useState(false)

  // ── Detecta contexto ──────────────────────────────────────────────
  const skillPrefixMatch = /^\/use-skill\s+(\S*)$/.exec(value)
  const atMentionMatch = /(@\S*)$/.exec(value)
  const skillPrefix = skillPrefixMatch?.[1] ?? ''
  const atPrefix = atMentionMatch?.[0] ?? ''

  // ── Async: busca arquivos quando @prefix muda ─────────────────────
  useEffect(() => {
    if (!atMentionMatch) {
      setFileSuggestions([])
      return
    }
    const query = (atMentionMatch[1] ?? '').replace(/^@/, '')
    const cwd = workspacePath ?? process.cwd()
    const valueBeforeAt = value.slice(0, value.length - atPrefix.length)

    let cancelled = false
    searchFilesByPrefix(query, cwd).then((files) => {
      if (cancelled) return
      setFileSuggestions(
        files.map((f) => ({
          label: '@' + f,
          description: '',
          insert: valueBeforeAt + '@' + f,
        })),
      )
    })
    return () => {
      cancelled = true
    }
  }, [atPrefix, workspacePath])

  // ── Sugestões por contexto ────────────────────────────────────────
  const suggestions = useMemo<Suggestion[]>(() => {
    if (dismissed) return []

    // 1. /use-skill <prefix> → skill list
    if (skillPrefixMatch) {
      const lp = skillPrefix.toLowerCase()
      return (skills ?? [])
        .filter((s) => !lp || s.name.toLowerCase().startsWith(lp))
        .map((s) => ({
          label: s.name,
          description: s.description,
          insert: `/use-skill ${s.name}`,
        }))
    }

    // 2. @prefix → arquivos (async)
    if (atMentionMatch) return fileSuggestions

    // 3. / → slash commands
    if (value.startsWith('/')) {
      if (value === '/') return SLASH_COMMANDS
      return SLASH_COMMANDS.filter((s) => s.label.startsWith(value))
    }

    return []
  }, [dismissed, value, skills, skillPrefixMatch, skillPrefix, atMentionMatch, fileSuggestions])

  const hasSuggestions = suggestions.length > 0

  // ── Refs frescos — evita stale closure no useInput ────────────────
  const suggestionsRef = useRef(suggestions)
  const selectedIdxRef = useRef(selectedIdx)
  suggestionsRef.current = suggestions
  selectedIdxRef.current = selectedIdx

  // ── Teclado: Tab + ↑↓ + Esc ──────────────────────────────────────
  // Guarda interna no callback em vez de { isActive } para evitar
  // re-registro do hook quando isDisabled muda (causa perda de eventos).
  useInput((input, key) => {
    if (isDisabled) return

    // Esc fecha o dropdown (qualquer tipo)
    if (key.escape) {
      setDismissed(true)
      setFileSuggestions([])
      setSelectedIdx(0)
      return
    }

    const sug = suggestionsRef.current
    if (sug.length === 0) return

    if (key.tab || input === '\t') {
      const s = sug[selectedIdxRef.current]
      if (s) {
        setValue(s.insert)
        setInputKey((k) => k + 1)
        setFileSuggestions([])
        setDismissed(false)
      }
      setSelectedIdx(0)
      return
    }
    if (key.upArrow) {
      setSelectedIdx((i) => (i === 0 ? sug.length - 1 : i - 1))
    } else if (key.downArrow) {
      setSelectedIdx((i) => (i === sug.length - 1 ? 0 : i + 1))
    }
  })

  function handleChange(v: string) {
    if (v.includes('\t')) {
      const sug = suggestionsRef.current
      if (sug.length > 0) {
        const s = sug[selectedIdxRef.current]
        if (s) {
          setValue(s.insert)
          setInputKey((k) => k + 1)
          setFileSuggestions([])
          return
        }
      }
      setValue(v.replace(/\t/g, ''))
      return
    }
    if (v === value) return
    setValue(v)
    setSelectedIdx(0)
    setDismissed(false)
  }

  function handleSubmit(text: string) {
    const trimmed = text.trim()
    if (!trimmed || isDisabled) return
    setValue('')
    setSelectedIdx(0)
    setFileSuggestions([])
    onSubmit(trimmed)
  }

  // Cabeçalho do painel muda por contexto
  const panelHint = skillPrefixMatch
    ? 'Skills disponíveis'
    : atMentionMatch
      ? 'Arquivos do workspace'
      : 'Comandos'

  return (
    <Box flexDirection="column">
      {/* Painel de sugestões */}
      {hasSuggestions && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={theme.accent}
          paddingX={1}
          marginBottom={0}
        >
          <Box marginBottom={0}>
            <Text color={theme.muted} dimColor>
              {panelHint}
            </Text>
          </Box>
          {suggestions.map((s, i) => {
            const isSelected = i === selectedIdx
            return (
              <Box key={s.label} gap={1}>
                <Text color={isSelected ? theme.accent : theme.muted} bold={isSelected}>
                  {isSelected ? '▶ ' : '  '}
                </Text>
                <Text color={isSelected ? theme.accent : theme.secondary} bold={isSelected}>
                  {s.label}
                </Text>
                {s.description ? (
                  <Text color={theme.muted}>
                    {'  '}
                    {s.description}
                  </Text>
                ) : null}
              </Box>
            )
          })}
          <Box marginTop={0}>
            <Text color={theme.muted} dimColor>
              ↑↓ navegar │ Tab autocompletar │ Esc fechar
            </Text>
          </Box>
        </Box>
      )}

      {/* Input */}
      <Box borderStyle="round" borderColor={isDisabled ? theme.muted : theme.primary} paddingX={1}>
        <Text color={isDisabled ? theme.muted : theme.accent} bold>
          {'❯ '}
        </Text>
        {isDisabled ? (
          <Text color={theme.muted} italic>
            Aguardando resposta...
          </Text>
        ) : (
          <TextInput
            key={inputKey}
            value={value}
            onChange={handleChange}
            onSubmit={handleSubmit}
            placeholder="Digite sua mensagem, / para comandos ou @ para arquivos..."
          />
        )}
      </Box>

      {!isDisabled && (
        <Box justifyContent="center" paddingX={1}>
          <Text color={theme.muted} dimColor>
            Enter enviar │ Ctrl+L limpar │ Esc abortar │ Ctrl+C sair
          </Text>
        </Box>
      )}
    </Box>
  )
}
