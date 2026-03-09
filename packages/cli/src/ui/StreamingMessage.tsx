/**
 * StreamingMessage — Mensagem do assistente durante streaming.
 * Mostra texto com cursor piscante no final.
 */

import { Box, Text } from 'ink'
import type { Theme } from '../types.js'
import { Markdown } from './Markdown.js'

interface StreamingMessageProps {
  content: string
  theme: Theme
}

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
