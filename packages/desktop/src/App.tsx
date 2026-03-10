/**
 * App — Layout principal do desktop: sidebar + chat + status bar.
 */

import { useCallback, useState } from 'react'
import iconUrl from './assets/icon.png'
import { useChat } from './hooks/useChat.js'
import { useTheme } from './hooks/useTheme.js'
import { useDeepLink } from './hooks/useDeepLink.js'
import { MessageList } from './components/MessageList.js'
import { InputArea } from './components/InputArea.js'
import { Sidebar } from './components/Sidebar.js'
import { StatusBar } from './components/StatusBar.js'

export function App() {
  const { messages, isStreaming, sessionId, status, sendMessage, abort, newSession } = useChat()
  const { theme, toggle: toggleTheme } = useTheme()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)

  const handleSelectSession = useCallback((_id: string) => {
    // TODO: implement session switching
  }, [])

  const handleDeepLinkMessage = useCallback((message: string) => {
    setPendingMessage(message)
  }, [])

  // Deep link handlers (athion://)
  useDeepLink({ onNew: newSession, onMessage: handleDeepLinkMessage })

  return (
    <div className="flex h-screen flex-col bg-surface-950">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-surface-800 bg-surface-950 px-4 py-2">
        <div className="flex items-center gap-2">
          <img src={iconUrl} alt="Athion" className="h-5 w-5 rounded" />
          <h1 className="text-sm font-semibold text-neutral-300">Athion Assistent</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="text-xs text-neutral-500 hover:text-neutral-300"
            title="Alternar tema"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button
            onClick={newSession}
            className="rounded bg-accent-600 px-2 py-1 text-xs text-white hover:bg-accent-500"
          >
            + Nova sessão
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          currentSessionId={sessionId}
          onSelectSession={handleSelectSession}
          onNewSession={newSession}
          isCollapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((prev) => !prev)}
        />

        <div className="flex flex-1 flex-col">
          <MessageList messages={messages} isStreaming={isStreaming} />
          <InputArea
            onSubmit={(content) => {
              setPendingMessage(null)
              sendMessage(content)
            }}
            onAbort={abort}
            isStreaming={isStreaming}
            isDisabled={status !== 'ready'}
            {...(pendingMessage !== null ? { initialValue: pendingMessage } : {})}
          />
        </div>
      </div>

      <StatusBar status={status} />
    </div>
  )
}
