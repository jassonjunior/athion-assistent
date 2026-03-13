/**
 * SubAgentDisplay — Mostra progresso de um subagente.
 * Descrição: Exibe spinner enquanto o subagente roda, com nome e número de continuações.
 */

import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import type { SubAgentInfo, Theme } from '../types.js'

/** SubAgentDisplayProps
 * Descrição: Props do componente SubAgentDisplay.
 */
interface SubAgentDisplayProps {
  /** Informações do subagente a ser exibido */
  agent: SubAgentInfo
  /** Tema visual com as cores a serem aplicadas */
  theme: Theme
}

/** SubAgentDisplay
 * Descrição: Componente que exibe o estado visual de um subagente em execução,
 * com spinner animado, ícone de status e contador de continuações.
 * @param props - Props contendo as informações do subagente e o tema visual
 * @returns Elemento React com a exibição do subagente
 */
export function SubAgentDisplay({ agent, theme }: SubAgentDisplayProps) {
  const isRunning = agent.status === 'running'

  return (
    <Box marginLeft={2}>
      {isRunning ? (
        <Text color={theme.warning}>
          <Spinner type="dots" />
        </Text>
      ) : (
        <Text color={agent.status === 'completed' ? theme.success : theme.error}>
          {agent.status === 'completed' ? '✓' : '✗'}
        </Text>
      )}
      <Text color={theme.accent} bold>
        {' '}
        Agent: {agent.name}
      </Text>
      {agent.continuations > 0 && <Text color={theme.muted}> (cont. {agent.continuations})</Text>}
    </Box>
  )
}
