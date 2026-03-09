/**
 * ToolCallDisplay — Mostra uma tool call com status.
 *
 * Estados visuais:
 *   🔧 running  → spinner + nome da tool
 *   ✅ success  → nome + resultado resumido
 *   ❌ error    → nome + mensagem de erro
 */

import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import type { Theme, ToolCallInfo } from '../types.js'

interface ToolCallDisplayProps {
  toolCall: ToolCallInfo
  theme: Theme
}

export function ToolCallDisplay({ toolCall, theme }: ToolCallDisplayProps) {
  const argsPreview = formatArgs(toolCall.args)

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Box>
        <StatusIcon status={toolCall.status} theme={theme} />
        <Text color={theme.accent} bold>
          {' '}
          {toolCall.name}
        </Text>
        {argsPreview && <Text color={theme.muted}> ({argsPreview})</Text>}
      </Box>
      {toolCall.result && toolCall.status === 'success' && (
        <Text color={theme.muted} dimColor>
          {'  '}
          {toolCall.result.slice(0, 100)}
        </Text>
      )}
      {toolCall.result && toolCall.status === 'error' && (
        <Text color={theme.error}> {toolCall.result}</Text>
      )}
    </Box>
  )
}

function StatusIcon({ status, theme }: { status: string; theme: Theme }) {
  switch (status) {
    case 'running':
      return (
        <Text color={theme.warning}>
          <Spinner type="dots" />
        </Text>
      )
    case 'success':
      return <Text color={theme.success}>✓</Text>
    case 'error':
      return <Text color={theme.error}>✗</Text>
    default:
      return <Text color={theme.muted}>○</Text>
  }
}

function formatArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return ''
  const entries = Object.entries(args as Record<string, unknown>)
  if (entries.length === 0) return ''
  return entries
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
    .join(', ')
}
