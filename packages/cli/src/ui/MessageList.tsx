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
  return (
    <Box flexDirection="column" paddingX={1} flexGrow={1}>
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} theme={theme} />
      ))}

      {isStreaming && (
        <Box flexDirection="column" marginY={1}>
          <Text color={theme.secondary} bold>
            Assistant
          </Text>
          <StreamingMessage content={streamingContent} theme={theme} />
          {currentTool && <ToolCallDisplay toolCall={currentTool} theme={theme} />}
          {currentAgent && <SubAgentDisplay agent={currentAgent} theme={theme} />}
        </Box>
      )}
    </Box>
  )
}

function MessageBubble({ message, theme }: { message: ChatMessage; theme: Theme }) {
  const roleColor = message.role === 'user' ? theme.primary : theme.secondary
  const roleLabel = message.role === 'user' ? 'You' : 'Assistant'

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color={roleColor} bold>
        {roleLabel}
      </Text>
      <Box marginLeft={message.role === 'user' ? 0 : 0}>
        <Markdown content={message.content} theme={theme} />
      </Box>
      {message.toolCalls?.map((tc) => (
        <ToolCallDisplay key={tc.id} toolCall={tc} theme={theme} />
      ))}
    </Box>
  )
}
