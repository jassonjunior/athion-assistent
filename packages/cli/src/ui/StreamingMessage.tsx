/**
 * StreamingMessage — Mensagem do assistente durante streaming.
 * Descrição: Exibe o conteúdo parcial da resposta do assistente com cursor piscante no final.
 */

import { Box, Text } from 'ink'
import type { Theme } from '../types.js'
import { Markdown } from './Markdown.js'

/** StreamingMessageProps
 * Descrição: Props do componente StreamingMessage.
 */
interface StreamingMessageProps {
  /** Conteúdo parcial recebido durante o streaming */
  content: string
  /** Tema visual com as cores a serem aplicadas */
  theme: Theme
}

/** StreamingMessage
 * Descrição: Componente que renderiza a resposta do assistente em tempo real durante o streaming,
 * exibindo "Pensando..." quando vazio ou o conteúdo markdown com cursor piscante.
 * @param props - Props contendo o conteúdo parcial e o tema visual
 * @returns Elemento React com a mensagem em streaming
 */
export function StreamingMessage({ content, theme }: StreamingMessageProps) {
  if (!content) {
    return (
      <Box marginLeft={2}>
        <Text color={theme.muted}>Pensando...</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Markdown content={content} theme={theme} />
      <Text color={theme.accent}>▌</Text>
    </Box>
  )
}
