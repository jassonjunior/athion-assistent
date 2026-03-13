/**
 * StatusBar — Barra de status no topo do chat.
 * Descrição: Exibe informações contextuais como modelo ativo, tokens usados,
 * skill ativa e ID da sessão.
 */

import { Box, Text } from 'ink'
import type { Theme, TokenInfo } from '../types.js'

/** StatusBarProps
 * Descrição: Props do componente StatusBar.
 */
interface StatusBarProps {
  /** Nome do modelo LLM ativo */
  model: string
  /** ID da sessão de conversa atual */
  sessionId: string
  /** Informações de uso de tokens da última resposta */
  tokens: TokenInfo | null
  /** Nome da skill ativa, se houver */
  activeSkill: string | undefined
  /** Tema visual com as cores a serem aplicadas */
  theme: Theme
}

/** StatusBar
 * Descrição: Componente que renderiza a barra de status no topo do chat com modelo,
 * skill ativa, contagem de tokens e ID da sessão.
 * @param props - Props contendo modelo, sessão, tokens, skill ativa e tema
 * @returns Elemento React com a barra de status
 */
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
