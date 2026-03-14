/**
 * PermissionPrompt — Diálogo interativo de aprovação de permissão.
 * Descrição: Componente que exibe um prompt para o usuário aprovar ou negar
 * a execução de uma ferramenta que requer permissão.
 *
 * Renderizado acima do UserInput quando uma tool requer aprovação.
 * Teclas:
 *   y / Enter  → allow + once
 *   s          → allow + session
 *   r          → allow + remember
 *   n / Esc    → deny
 */

import { Box, Text, useInput } from 'ink'
import type { PermissionDecision, PermissionScope } from '@athion/core'
import type { Theme } from '../types.js'

/** PermissionPromptProps
 * Descrição: Props do componente PermissionPrompt.
 */
interface PermissionPromptProps {
  /** Nome da ferramenta que requer permissão */
  toolName: string
  /** Alvo da operação (arquivo, diretório, etc.) */
  target: string
  /** Callback chamado quando o usuário toma uma decisão */
  onDecide: (decision: PermissionDecision, scope: PermissionScope) => void
  /** Tema visual com as cores a serem aplicadas */
  theme: Theme
}

/** PermissionPrompt
 * Descrição: Componente que renderiza um diálogo de permissão com opções de allow/deny
 * e diferentes escopos (once, session, remember).
 * @param props - Props contendo nome da tool, alvo, callback de decisão e tema
 * @returns Elemento React com o diálogo de permissão
 */
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
