import { useEffect, useMemo, useState } from 'react'
import type { FlowEventMessage } from '../server/protocol'
import { isFlowEvent } from '../server/protocol'
import { ErrorBoundary } from './components/ErrorBoundary'
import { FlowPanelLive } from './components/FlowPanelLive'
import { LogPanelLive } from './components/LogPanelLive'
import { useDesktopNotification } from './hooks/useDesktopNotification'
import { useWebSocket } from './hooks/useWebSocket'
import { isTauri } from './utils/platform'

type ViewMode = 'split' | 'flow' | 'log'

const DEFAULT_PORT = '4200'

function getWsUrl(): string {
  const host = window.location.hostname || 'localhost'
  const port = new URLSearchParams(window.location.search).get('port') ?? DEFAULT_PORT
  return `ws://${host}:${port}`
}

export function App() {
  const wsUrl = getWsUrl()
  const { connected, messages, clearMessages } = useWebSocket(wsUrl)
  const isDesktop = useMemo(() => isTauri(), [])
  useDesktopNotification(messages)
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [waitingConnection, setWaitingConnection] = useState(!connected)

  useEffect(() => {
    if (connected) {
      setWaitingConnection(false)
      return
    }
    setWaitingConnection(true)
    const timer = setTimeout(() => setWaitingConnection(true), 15_000)
    return () => clearTimeout(timer)
  }, [connected])

  const liveMessages = useMemo(
    () => messages.filter(isFlowEvent) as unknown as FlowEventMessage[],
    [messages],
  )

  if (!connected && waitingConnection) {
    return (
      <div className="app loading-screen">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p>Conectando ao servidor...</p>
          <span className="ws-url">{wsUrl}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Athion Observability</h1>
        <div className="header-controls">
          <span className={`connection-dot ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '● Conectado' : '○ Desconectado'}
          </span>
          {!isDesktop && <span className="ws-url">{wsUrl}</span>}
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
          <button className="btn btn-sm" onClick={clearMessages}>
            Clear
          </button>
        </div>
      </header>

      <div className={`main-content ${viewMode}`}>
        {(viewMode === 'split' || viewMode === 'flow') && (
          <ErrorBoundary fallbackMessage="Erro ao renderizar Flow Panel">
            <FlowPanelLive messages={liveMessages} />
          </ErrorBoundary>
        )}
        {(viewMode === 'split' || viewMode === 'log') && (
          <ErrorBoundary fallbackMessage="Erro ao renderizar Log Panel">
            <LogPanelLive messages={liveMessages} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  )
}
