/**
 * SubAgentDisplay — Mostra progresso de um subagente.
 *
 * Exibe spinner enquanto roda, nome do agente e continuações.
 */

import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import type { SubAgentInfo, Theme } from '../types.js'

interface SubAgentDisplayProps {
  agent: SubAgentInfo
  theme: Theme
}

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
