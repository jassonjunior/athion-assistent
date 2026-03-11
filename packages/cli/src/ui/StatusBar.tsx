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
  activeSkill: string | undefined
  theme: Theme
}

export function StatusBar({ model, sessionId, tokens, activeSkill, theme }: StatusBarProps) {
  const shortId = sessionId.slice(0, 8)
  const tokenText = tokens ? `${tokens.totalTokens.toLocaleString()} tok` : ''

  return (
    <Box
      borderStyle="round"
      borderColor={theme.primary}
      paddingX={1}
      justifyContent="space-between"
    >
      <Box>
        <Text color={theme.primary} bold>
          {'◆ Athion'}
        </Text>
        <Text color={theme.muted}> │ </Text>
        <Text color={theme.secondary}>{model}</Text>
        {activeSkill && (
          <>
            <Text color={theme.muted}> │ </Text>
            <Text color={theme.accent} bold>
              {'● '}
            </Text>
            <Text color={theme.accent}>{activeSkill}</Text>
          </>
        )}
      </Box>
      <Box>
        {tokenText && (
          <>
            <Text color={theme.accent}>{tokenText}</Text>
            <Text color={theme.muted}> │ </Text>
          </>
        )}
        <Text color={theme.muted}>#{shortId}</Text>
      </Box>
    </Box>
  )
}
