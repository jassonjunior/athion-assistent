/**
 * MessageList — Renderiza o histórico de mensagens.
 * Descrição: Exibe a lista de mensagens do chat distinguindo user/assistant/system
 * com cores diferentes, incluindo tool calls e subagentes inline.
 */

import { Box, Text } from 'ink'
import type { ChatMessage, SubAgentInfo, Theme, ToolCallInfo } from '../types.js'
import { Markdown } from './Markdown.js'
import { StreamingMessage } from './StreamingMessage.js'
import { ToolCallDisplay } from './ToolCallDisplay.js'
import { SubAgentDisplay } from './SubAgentDisplay.js'
import { useFeedbackPhrase } from './hooks/useFeedbackPhrase.js'

/** MessageListProps
 * Descrição: Props do componente MessageList.
 */
interface MessageListProps {
  /** Lista de mensagens do histórico do chat */
  messages: ChatMessage[]
  /** Indica se o assistente está gerando uma resposta */
  isStreaming: boolean
  /** Conteúdo parcial da resposta em streaming */
  streamingContent: string
  /** Ferramenta sendo executada atualmente */
  currentTool: ToolCallInfo | null
  /** Subagente em execução atualmente */
  currentAgent: SubAgentInfo | null
  /** Tema visual com as cores a serem aplicadas */
  theme: Theme
}

/** MessageList
 * Descrição: Componente que renderiza o histórico de mensagens e o estado de streaming atual,
 * incluindo feedback visual durante o processamento do LLM.
 * @param props - Props contendo mensagens, estado de streaming, tool/agent ativos e tema
 * @returns Elemento React com a lista de mensagens
 */
export function MessageList({
  messages,
  isStreaming,
  streamingContent,
  currentTool,
  currentAgent,
  theme,
}: MessageListProps) {
  const feedbackPhrase = useFeedbackPhrase(isStreaming)

  return (
    <Box flexDirection="column" paddingX={1} flexGrow={1}>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} theme={theme} />
      ))}

      {isStreaming && (
        <Box flexDirection="column" marginY={1}>
          <Text color={theme.secondary} bold>
            ◆ Athion
          </Text>
          <StreamingMessage content={streamingContent} theme={theme} />
          {currentTool && <ToolCallDisplay toolCall={currentTool} theme={theme} />}
          {currentAgent && <SubAgentDisplay agent={currentAgent} theme={theme} />}
          {!streamingContent && !currentTool && !currentAgent && feedbackPhrase && (
            <Text color={theme.muted} dimColor>
              {feedbackPhrase}
            </Text>
          )}
        </Box>
      )}
    </Box>
  )
}

/** MessageBubble
 * Descrição: Renderiza uma única mensagem do chat com ícone de papel, horário e conteúdo formatado.
 * @param props - Props contendo a mensagem e o tema visual
 * @returns Elemento React com o balão de mensagem
 */
function MessageBubble({ message, theme }: { message: ChatMessage; theme: Theme }) {
  const isUser = message.role === 'user'
  const roleColor = isUser ? theme.primary : theme.secondary
  const roleIcon = isUser ? '◇' : '◆'
  const roleLabel = isUser ? 'Você' : 'Athion'

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text color={roleColor} bold>
          {roleIcon} {roleLabel}
        </Text>
        <Text color={theme.muted} dimColor>
          {' '}
          {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </Box>
      <Box marginLeft={2} flexDirection="column">
        <Markdown content={message.content} theme={theme} />
      </Box>
      {message.toolCalls?.map((tc) => (
        <ToolCallDisplay key={tc.id} toolCall={tc} theme={theme} />
      ))}
    </Box>
  )
}
