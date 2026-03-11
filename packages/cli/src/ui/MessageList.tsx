/**
 * MessageList — Renderiza o histórico de mensagens.
 * Distingue user/assistant/system com cores diferentes.
 * Mostra tool calls e subagent info inline.
 */

import { Box, Text } from 'ink'
import type { ChatMessage, SubAgentInfo, Theme, ToolCallInfo } from '../types.js'
import { Markdown } from './Markdown.js'
import { StreamingMessage } from './StreamingMessage.js'
import { ToolCallDisplay } from './ToolCallDisplay.js'
import { SubAgentDisplay } from './SubAgentDisplay.js'
import { useFeedbackPhrase } from './hooks/useFeedbackPhrase.js'

interface MessageListProps {
  messages: ChatMessage[]
  isStreaming: boolean
  streamingContent: string
  currentTool: ToolCallInfo | null
  currentAgent: SubAgentInfo | null
  theme: Theme
}

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
