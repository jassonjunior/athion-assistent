/**
 * StatusBar — Barra de status no topo do chat.
 * Mostra: modelo ativo, tokens usados, session ID.
 */

import { Box, Text } from 'ink'
import type { Theme, TokenInfo } from '../types.js'

interface StatusBarProps {
  model: string
  sessionId: string
  tokens: TokenInfo | null
  theme: Theme
}

export function StatusBar({ model, sessionId, tokens, theme }: StatusBarProps) {
  const shortId = sessionId.slice(0, 8)
  const tokenText = tokens ? `${tokens.totalTokens.toLocaleString()} tokens` : ''

  return (
    <Box borderStyle="single" borderColor={theme.muted} paddingX={1}>
      <Text color={theme.primary} bold>
        Athion
      </Text>
      <Text color={theme.muted}> │ </Text>
      <Text color={theme.secondary}>{model}</Text>
      <Text color={theme.muted}> │ </Text>
      <Text color={theme.muted}>#{shortId}</Text>
      {tokenText && (
        <>
          <Text color={theme.muted}> │ </Text>
          <Text color={theme.accent}>{tokenText}</Text>
        </>
      )}
    </Box>
  )
}
