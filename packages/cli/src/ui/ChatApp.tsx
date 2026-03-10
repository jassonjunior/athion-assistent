/**
 * ChatApp — Componente raiz do chat interativo.
 *
 * Layout:
 *   ┌─ StatusBar ─────────────────┐
 *   │ MessageList (flex grow)     │
 *   └─ UserInput ─────────────────┘
 *
 * Orquestra hooks e passa props para componentes filhos.
 */

import { Box } from 'ink'
import type { AthionCore, Session } from '@athion/core'
import { StatusBar } from './StatusBar.js'
import { MessageList } from './MessageList.js'
import { UserInput } from './UserInput.js'
import { PermissionPrompt } from './PermissionPrompt.js'
import { useChat } from '../hooks/useChat.js'
import { useTheme } from '../hooks/useTheme.js'
import { useKeyboard } from '../hooks/useKeyboard.js'
import { usePermission } from '../hooks/usePermission.js'
import { useSession } from '../hooks/useSession.js'

interface ChatAppProps {
  core: AthionCore
  session: Session
}

export function ChatApp({ core, session: initialSession }: ChatAppProps) {
  const theme = useTheme(core)
  const model = core.config.get('model')
  const { session } = useSession(core, initialSession)
  const permission = usePermission(core)
  const chat = useChat(core, session.id, permission.requestPermission)

  useKeyboard({
    onClear: () => {
      // TODO: limpar mensagens
    },
  })

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar model={model} sessionId={session.id} tokens={chat.tokens} theme={theme} />

      <MessageList
        messages={chat.messages}
        isStreaming={chat.isStreaming}
        streamingContent={
          chat.isStreaming && chat.messages.length > 0
            ? (chat.messages[chat.messages.length - 1]?.content ?? '')
            : ''
        }
        currentTool={chat.currentTool}
        currentAgent={chat.currentAgent}
        theme={theme}
      />

      {permission.pendingRequest && (
        <PermissionPrompt
          toolName={permission.pendingRequest.toolName}
          target={permission.pendingRequest.target}
          onDecide={permission.grant}
          theme={theme}
        />
      )}

      <UserInput onSubmit={chat.sendMessage} isDisabled={chat.isStreaming} theme={theme} />
    </Box>
  )
}
