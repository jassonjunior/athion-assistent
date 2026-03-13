/**
 * ToolCallDisplay — Mostra uma tool call com status.
 * Descrição: Exibe o estado visual de uma chamada de ferramenta com ícone de status,
 * nome, argumentos e resultado.
 *
 * Estados visuais:
 *   running  → spinner + nome da tool
 *   success  → nome + resultado resumido
 *   error    → nome + mensagem de erro
 */

import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import type { Theme, ToolCallInfo } from '../types.js'

/** ToolCallDisplayProps
 * Descrição: Props do componente ToolCallDisplay.
 */
interface ToolCallDisplayProps {
  /** Informações da chamada de ferramenta a ser exibida */
  toolCall: ToolCallInfo
  /** Tema visual com as cores a serem aplicadas */
  theme: Theme
}

/** ToolCallDisplay
 * Descrição: Componente que renderiza uma chamada de ferramenta com ícone de status animado,
 * preview dos argumentos e resultado quando disponível.
 * @param props - Props contendo as informações da tool call e o tema visual
 * @returns Elemento React com a exibição da tool call
 */
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

/** StatusIcon
 * Descrição: Renderiza o ícone de status da tool call (spinner, check ou erro).
 * @param props - Props contendo o status atual e o tema visual
 * @returns Elemento React com o ícone de status apropriado
 */
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

/** formatArgs
 * Descrição: Formata os argumentos de uma tool call para exibição resumida.
 * @param args - Argumentos da tool call (objeto genérico)
 * @returns String formatada com até 2 entradas do objeto, ou string vazia
 */
function formatArgs(args: unknown): string {
  if (!args || typeof args !== 'object') return ''
  const entries = Object.entries(args as Record<string, unknown>)
  if (entries.length === 0) return ''
  return entries
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`)
    .join(', ')
}
