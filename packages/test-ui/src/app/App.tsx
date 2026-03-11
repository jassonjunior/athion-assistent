import { useMemo, useState } from 'react'
import type { TestInfo } from '../server/protocol'
import type { WsServerMessage } from '../server/protocol'
import { FlowPanel } from './components/FlowPanel'
import { LogPanel } from './components/LogPanel'
import { TestSelector } from './components/TestSelector'
import { TokenBar } from './components/TokenBar'
import { useTokenTracker } from './hooks/useTokenTracker'
import { useWebSocket } from './hooks/useWebSocket'

type ViewMode = 'split' | 'flow' | 'log'

/** Constrói URL do WebSocket. Conecta direto ao backend (3457). */
function getWsUrl(): string {
  const host = window.location.hostname || 'localhost'
  // Em dev (Vite 3456) ou produção (server 3457), sempre conecta ao server backend
  const backendPort = '3457'
  return `ws://${host}:${backendPort}/api/ws`
}

export function App() {
  const wsUrl = getWsUrl()
  const { connected, messages, send, clearMessages } = useWebSocket(wsUrl)
  const tokens = useTokenTracker(messages)
  const [running, setRunning] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('split')

  const tests = useMemo(() => {
    const listMsg = messages.find(
      (m): m is Extract<WsServerMessage, { type: 'test:list' }> => m.type === 'test:list',
    )
    return listMsg?.tests ?? []
  }, [messages])

  const handleRun = (testName: string) => {
    clearMessages()
    setRunning(true)
    send({ type: 'test:run', testName })
  }

  const handleStop = () => {
    send({ type: 'test:stop' })
    setRunning(false)
  }

  // Detect test:finished to update running state
  useMemo(() => {
    const lastFinish = [...messages]
      .reverse()
      .find(
        (m): m is Extract<WsServerMessage, { type: 'test:finished' }> => m.type === 'test:finished',
      )
    if (lastFinish) setRunning(false)
  }, [messages])

  // Filter out test:list from display messages
  const displayMessages = useMemo(() => messages.filter((m) => m.type !== 'test:list'), [messages])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Athion Test UI</h1>
        <div className="view-modes">
          <button
            className={`btn btn-sm ${viewMode === 'split' ? 'btn-active' : ''}`}
            onClick={() => setViewMode('split')}
          >
            Split
          </button>
          <button
            className={`btn btn-sm ${viewMode === 'flow' ? 'btn-active' : ''}`}
            onClick={() => setViewMode('flow')}
          >
            Flow
          </button>
          <button
            className={`btn btn-sm ${viewMode === 'log' ? 'btn-active' : ''}`}
            onClick={() => setViewMode('log')}
          >
            Log
          </button>
        </div>
      </header>

      <TestSelector
        tests={tests as TestInfo[]}
        running={running}
        connected={connected}
        onRun={handleRun}
        onStop={handleStop}
        onClear={clearMessages}
      />

      <div className={`main-content ${viewMode}`}>
        {(viewMode === 'split' || viewMode === 'flow') && <FlowPanel messages={displayMessages} />}
        {(viewMode === 'split' || viewMode === 'log') && <LogPanel messages={displayMessages} />}
      </div>

      <TokenBar tokens={tokens} />
    </div>
  )
}
