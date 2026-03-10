/**
 * PermissionPrompt — Dialogo interativo de aprovacao de permissao.
 *
 * Renderizado acima do UserInput quando uma tool requer aprovacao.
 * Teclas:
 *   y / Enter  → allow + once
 *   s          → allow + session
 *   r          → allow + remember
 *   n / Esc    → deny
 */

import { Box, Text, useInput } from 'ink'
import type { PermissionDecision, PermissionScope } from '@athion/core'
import type { Theme } from '../types.js'

interface PermissionPromptProps {
  toolName: string
  target: string
  onDecide: (decision: PermissionDecision, scope: PermissionScope) => void
  theme: Theme
}

export function PermissionPrompt({ toolName, target, onDecide, theme }: PermissionPromptProps) {
  useInput((input, key) => {
    if (input === 'y' || key.return) {
      onDecide('allow', 'once')
    } else if (input === 's') {
      onDecide('allow', 'session')
    } else if (input === 'r') {
      onDecide('allow', 'remember')
    } else if (input === 'n' || key.escape) {
      onDecide('deny', 'once')
    }
  })

  return (
    <Box
      borderStyle="round"
      borderColor={theme.warning}
      flexDirection="column"
      paddingX={1}
      marginBottom={1}
    >
      <Text color={theme.warning} bold>
        Permission Required
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text>
          <Text color={theme.muted}>Tool: </Text>
          <Text color={theme.primary} bold>
            {toolName}
          </Text>
        </Text>
        <Text>
          <Text color={theme.muted}>Target: </Text>
          <Text>{target}</Text>
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text color={theme.muted}>
          [<Text color={theme.success}>y</Text>] allow once{'  '}[
          <Text color={theme.accent}>s</Text>] allow session{'  '}[
          <Text color={theme.secondary}>r</Text>] remember{'  '}[<Text color={theme.error}>n</Text>]
          deny
        </Text>
      </Box>
    </Box>
  )
}
