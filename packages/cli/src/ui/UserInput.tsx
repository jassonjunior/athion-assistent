/**
 * UserInput — Campo de entrada de texto do usuário.
 * Usa ink-text-input para captura de texto.
 * Enter envia a mensagem, desabilitado durante streaming.
 */

import { Box, Text } from 'ink'
import TextInput from 'ink-text-input'
import { useState } from 'react'
import type { Theme } from '../types.js'

interface UserInputProps {
  onSubmit: (content: string) => void
  isDisabled: boolean
  theme: Theme
}

export function UserInput({ onSubmit, isDisabled, theme }: UserInputProps) {
  const [value, setValue] = useState('')

  function handleSubmit(text: string) {
    const trimmed = text.trim()
    if (!trimmed || isDisabled) return
    setValue('')
    onSubmit(trimmed)
  }

  return (
    <Box borderStyle="single" borderColor={isDisabled ? theme.muted : theme.primary} paddingX={1}>
      <Text color={theme.primary} bold>
        {'> '}
      </Text>
      {isDisabled ? (
        <Text color={theme.muted}>Aguardando resposta...</Text>
      ) : (
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={handleSubmit}
          placeholder="Digite sua mensagem..."
        />
      )}
    </Box>
  )
}
