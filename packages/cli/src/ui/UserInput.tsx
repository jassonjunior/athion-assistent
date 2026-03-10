/**
 * UserInput — Campo de entrada de texto do usuário.
 *
 * Funcionalidades:
 * - Autocomplete de slash commands ao digitar "/"
 * - Sugestão de @mentions ao digitar "@"
 * - Tab para autocompletar sugestão selecionada
 * - Setas ↑↓ para navegar nas sugestões
 */

import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { useState, useMemo, useRef } from 'react'
import type { Theme } from '../types.js'

interface UserInputProps {
  onSubmit: (content: string) => void
  isDisabled: boolean
  theme: Theme
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
  { label: '/skills', description: 'Listar skills disponíveis', insert: '/skills' },
  { label: '/model', description: 'Mostrar modelo e provider', insert: '/model' },
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

export function UserInput({ onSubmit, isDisabled, theme }: UserInputProps) {
  const [value, setValue] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [inputKey, setInputKey] = useState(0)

  // Calcula sugestões com base no que foi digitado
  const suggestions = useMemo<Suggestion[]>(() => {
    if (!value.startsWith('/') && !value.startsWith('@')) return []
    if (value.startsWith('/')) {
      if (value === '/') return SLASH_COMMANDS
      return SLASH_COMMANDS.filter((s) => s.label.startsWith(value))
    }
    return []
  }, [value])

  const hasSuggestions = suggestions.length > 0

  // Refs sempre frescos — evita stale closure no useInput
  const suggestionsRef = useRef(suggestions)
  const selectedIdxRef = useRef(selectedIdx)
  suggestionsRef.current = suggestions
  selectedIdxRef.current = selectedIdx

  // Tab + setas ↑↓ via useInput (acessa refs para nunca ter closure velha)
  useInput(
    (input, key) => {
      const sug = suggestionsRef.current
      if (sug.length === 0) return

      if (key.tab || input === '\t') {
        const s = sug[selectedIdxRef.current]
        if (s) {
          setValue(s.insert)
          setInputKey((k) => k + 1) // força remount → cursor vai para o fim
        }
        setSelectedIdx(0)
        return
      }
      if (key.upArrow) {
        setSelectedIdx((i) => (i === 0 ? sug.length - 1 : i - 1))
      } else if (key.downArrow) {
        setSelectedIdx((i) => (i === sug.length - 1 ? 0 : i + 1))
      }
    },
    { isActive: !isDisabled },
  )

  function handleChange(v: string) {
    // Fallback: caso \t chegue via onChange (alguns terminais)
    if (v.includes('\t')) {
      const sug = suggestionsRef.current
      if (sug.length > 0) {
        const s = sug[selectedIdxRef.current]
        if (s) {
          setValue(s.insert)
          setInputKey((k) => k + 1) // força remount → cursor vai para o fim
          return
        }
      }
      setValue(v.replace(/\t/g, ''))
      return
    }
    setValue(v)
    setSelectedIdx(0)
  }

  function handleSubmit(text: string) {
    const sug = suggestionsRef.current
    // Se há sugestões, Enter insere a selecionada (não envia ao LLM)
    if (sug.length > 0) {
      const s = sug[selectedIdxRef.current]
      if (s) {
        setValue(s.insert)
        setInputKey((k) => k + 1)
        setSelectedIdx(0)
      }
      return
    }
    const trimmed = text.trim()
    if (!trimmed || isDisabled) return
    setValue('')
    setSelectedIdx(0)
    onSubmit(trimmed)
  }

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
                <Text color={theme.muted}>
                  {'  '}
                  {s.description}
                </Text>
              </Box>
            )
          })}
          <Box marginTop={0}>
            <Text color={theme.muted} dimColor>
              ↑↓ navegar │ Tab autocompletar
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
            placeholder="Digite sua mensagem ou / para comandos..."
          />
        )}
      </Box>

      {!isDisabled && (
        <Box justifyContent="center" paddingX={1}>
          <Text color={theme.muted} dimColor>
            Enter enviar │ Ctrl+L limpar │ Ctrl+C sair
          </Text>
        </Box>
      )}
    </Box>
  )
}
