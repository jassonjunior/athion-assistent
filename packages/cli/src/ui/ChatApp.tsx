/**
 * ChatApp — Componente raiz do chat interativo.
 * Descrição: Orquestra todos os hooks e componentes filhos para compor a interface completa do chat.
 *
 * Layout:
 *   ┌─ StatusBar ─────────────────┐
 *   │ MessageList (flex grow)     │
 *   └─ UserInput ─────────────────┘
 */

import { Box } from 'ink'
import { useState } from 'react'
import type { AthionCore, Session, SkillDefinition } from '@athion/core'
import { StatusBar } from './StatusBar.js'
import { MessageList } from './MessageList.js'
import { UserInput } from './UserInput.js'
import { PermissionPrompt } from './PermissionPrompt.js'
import { WelcomeScreen } from './WelcomeScreen.js'
import { SkillsMenu } from './SkillsMenu.js'
import { useChat } from '../hooks/useChat.js'
import { useTheme } from '../hooks/useTheme.js'
import { useKeyboard } from '../hooks/useKeyboard.js'
import { usePermission } from '../hooks/usePermission.js'
import { useSession } from '../hooks/useSession.js'
import { useIndexingProgress } from '../hooks/useIndexingProgress.js'

/** ChatAppProps
 * Descrição: Props do componente ChatApp.
 */
interface ChatAppProps {
  /** Instância do core do Athion para comunicação com o backend */
  core: AthionCore
  /** Sessão inicial de conversa */
  session: Session
}

/** ChatApp
 * Descrição: Componente React raiz que monta a interface completa do chat interativo,
 * conectando hooks de tema, sessão, permissão, chat e teclado com os componentes visuais.
 * @param props - Props contendo a instância do core e a sessão inicial
 * @returns Elemento React com a aplicação de chat completa
 */
export function ChatApp({ core, session: initialSession }: ChatAppProps) {
  const theme = useTheme(core)
  const model = core.config.get('model')
  const { session } = useSession(core, initialSession)
  const permission = usePermission(core)
  const indexing = useIndexingProgress(core)
  const chat = useChat(core, session.id, permission.requestPermission)
  const [skills, setSkills] = useState<SkillDefinition[]>(() => core.skills.list())
  const [activeSkill, setActiveSkill] = useState<string | undefined>(
    () => core.skills.getActive()?.name,
  )

  useKeyboard({
    onClear: chat.clearMessages,
    onAbort: chat.abort,
  })

  return (
    <Box flexDirection="column" height="100%">
      <StatusBar
        model={model}
        sessionId={session.id}
        tokens={chat.tokens}
        activeSkill={activeSkill}
        indexing={indexing}
        theme={theme}
      />

      {chat.messages.length === 0 && !chat.isStreaming ? (
        <WelcomeScreen model={model} indexing={indexing} theme={theme} />
      ) : (
        <MessageList
          messages={chat.messages}
          isStreaming={chat.isStreaming}
          streamingContent={chat.streamingContent}
          currentTool={chat.currentTool}
          currentAgent={chat.currentAgent}
          theme={theme}
        />
      )}

      {permission.pendingRequest && (
        <PermissionPrompt
          toolName={permission.pendingRequest.toolName}
          target={permission.pendingRequest.target}
          onDecide={permission.grant}
          theme={theme}
        />
      )}

      {chat.skillsMenuOpen && (
        <SkillsMenu
          skills={skills}
          activeSkillName={activeSkill}
          theme={theme}
          onClose={() => chat.setSkillsMenuOpen(false)}
          onMessage={chat.addMessage}
          onSkillDeleted={(name) => {
            core.skills.unregister(name)
            setSkills(core.skills.list())
          }}
          onSkillActivated={(name) => {
            if (name) {
              core.skills.setActive(name)
            } else {
              core.skills.clearActive()
            }
            setActiveSkill(name)
          }}
        />
      )}

      <UserInput
        onSubmit={chat.sendMessage}
        isDisabled={chat.isStreaming || chat.skillsMenuOpen}
        theme={theme}
        skills={skills}
        workspacePath={process.cwd()}
      />
    </Box>
  )
}
