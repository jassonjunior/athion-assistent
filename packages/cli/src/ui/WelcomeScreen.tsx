/**
 * WelcomeScreen — Tela de boas-vindas exibida quando não há mensagens.
 * Mostra logo, modelo ativo, atalhos e dicas de uso.
 */

import { Box, Text } from 'ink'
import type { Theme } from '../types.js'

interface WelcomeScreenProps {
  model: string
  theme: Theme
}

export function WelcomeScreen({ model, theme }: WelcomeScreenProps) {
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      {/* Logo */}
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Text color={theme.primary} bold>
          {'  ╔═══════════════════╗'}
        </Text>
        <Text color={theme.primary} bold>
          {'  ║   '}
          <Text color={theme.accent} bold>
            ◆
          </Text>
          <Text color={theme.primary} bold>
            {' A T H I O N '}
          </Text>
          <Text color={theme.accent} bold>
            ◆
          </Text>
          {'   ║'}
        </Text>
        <Text color={theme.primary} bold>
          {'  ╚═══════════════════╝'}
        </Text>
      </Box>

      {/* Model info */}
      <Box marginBottom={1}>
        <Text color={theme.muted}>Modelo: </Text>
        <Text color={theme.secondary} bold>
          {model}
        </Text>
      </Box>

      {/* Divider */}
      <Box marginBottom={1}>
        <Text color={theme.muted}>{'─'.repeat(40)}</Text>
      </Box>

      {/* Quick actions */}
      <Box flexDirection="column" alignItems="center" marginBottom={1}>
        <Text color={theme.muted}>Comece digitando uma mensagem ou use:</Text>
      </Box>

      <Box flexDirection="column" paddingX={4} gap={0}>
        <Box>
          <Text color={theme.accent} bold>
            {'  /codebase index  '}
          </Text>
          <Text color={theme.muted}>Indexar projeto para busca semântica</Text>
        </Box>
        <Box>
          <Text color={theme.accent} bold>
            {'  /codebase <query> '}
          </Text>
          <Text color={theme.muted}>Buscar no código indexado</Text>
        </Box>
        <Box>
          <Text color={theme.accent} bold>
            {'  @arquivo           '}
          </Text>
          <Text color={theme.muted}>Mencionar arquivo ou símbolo</Text>
        </Box>
      </Box>

      {/* Keyboard shortcuts */}
      <Box marginTop={1}>
        <Text color={theme.muted}>{'─'.repeat(40)}</Text>
      </Box>

      <Box flexDirection="column" alignItems="center" marginTop={1}>
        <Box>
          <Text color={theme.warning}>Ctrl+L</Text>
          <Text color={theme.muted}> limpar </Text>
          <Text color={theme.muted}>│</Text>
          <Text color={theme.warning}> Ctrl+C</Text>
          <Text color={theme.muted}> sair </Text>
          <Text color={theme.muted}>│</Text>
          <Text color={theme.warning}> Enter</Text>
          <Text color={theme.muted}> enviar</Text>
        </Box>
      </Box>
    </Box>
  )
}
