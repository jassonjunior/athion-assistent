import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TestInfo } from '../server/protocol'
import type { WsServerMessage, FlowEventMessage } from '../server/protocol'
import { isFlowEvent } from '../server/protocol'
import { FlowPanel } from './components/FlowPanel'
import { FlowPanelLive } from './components/FlowPanelLive'
import { LogPanel } from './components/LogPanel'
import { LogPanelLive } from './components/LogPanelLive'
import { TestSelector } from './components/TestSelector'
import { TokenBar } from './components/TokenBar'
import { useDesktopNotification } from './hooks/useDesktopNotification'
import { useTokenTracker } from './hooks/useTokenTracker'
import { useWebSocket } from './hooks/useWebSocket'
import { isTauri } from './utils/platform'

type ViewMode = 'split' | 'flow' | 'log'
type AppMode = 'test' | 'live'

const DEFAULT_TEST_PORT = '3457'
const DEFAULT_LIVE_PORT = '4200'

/** Constroi URL do WebSocket para o modo selecionado */
function getWsUrl(mode: AppMode): string {
  const host = window.location.hostname || 'localhost'
  if (mode === 'live') {
    const port = new URLSearchParams(window.location.search).get('livePort') ?? DEFAULT_LIVE_PORT
    return `ws://${host}:${port}`
  }
  const port = new URLSearchParams(window.location.search).get('testPort') ?? DEFAULT_TEST_PORT
  return `ws://${host}:${port}/api/ws`
}

export function App() {
  const [appMode, setAppMode] = useState<AppMode>(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mode') === 'live') return 'live'
    const saved = localStorage.getItem('athion:appMode')
    if (saved === 'live' || saved === 'test') return saved
    return 'test'
  })
  const wsUrl = getWsUrl(appMode)
  const { connected, messages, send, clearMessages } = useWebSocket(wsUrl)
  const tokens = useTokenTracker(messages)
  const isDesktop = useMemo(() => isTauri(), [])
  useDesktopNotification(messages)
  const [running, setRunning] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [waitingConnection, setWaitingConnection] = useState(!connected)

  // Track connection timeout for loading screen
  useEffect(() => {
    if (connected) {
      setWaitingConnection(false)
      return
    }
    setWaitingConnection(true)
    const timer = setTimeout(() => setWaitingConnection(true), 15_000)
    return () => clearTimeout(timer)
  }, [connected])

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

  const toggleMode = useCallback(() => {
    clearMessages()
    setAppMode((prev) => {
      const next = prev === 'test' ? 'live' : 'test'
      localStorage.setItem('athion:appMode', next)
      return next
    })
  }, [clearMessages])

  // Detect test:finished to update running state (test mode only)
  useMemo(() => {
    if (appMode !== 'test') return
    const lastFinish = [...messages]
      .reverse()
      .find(
        (m): m is Extract<WsServerMessage, { type: 'test:finished' }> => m.type === 'test:finished',
      )
    if (lastFinish) setRunning(false)
  }, [messages, appMode])

  // Separar mensagens por modo
  const testMessages = useMemo(
    () =>
      appMode === 'test'
        ? (messages.filter((m) => !isFlowEvent(m) && m.type !== 'test:list') as WsServerMessage[])
        : [],
    [messages, appMode],
  )

  const liveMessages = useMemo(
    () =>
      appMode === 'live' ? (messages.filter(isFlowEvent) as unknown as FlowEventMessage[]) : [],
    [messages, appMode],
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
        <h1>Athion {appMode === 'live' ? 'Flow Observer' : 'Test UI'}</h1>
        <div className="header-controls">
          <button
            className={`btn btn-sm ${appMode === 'live' ? 'btn-live' : 'btn-test'}`}
            onClick={toggleMode}
          >
            {appMode === 'live' ? '🔴 Live Mode' : '🧪 Test Mode'}
          </button>
          <span className={`connection-dot ${connected ? 'connected' : 'disconnected'}`}>
            {connected ? '● Connected' : '○ Disconnected'}
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

      {appMode === 'test' && (
        <TestSelector
          tests={tests as TestInfo[]}
          running={running}
          connected={connected}
          onRun={handleRun}
          onStop={handleStop}
          onClear={clearMessages}
        />
      )}

      <div className={`main-content ${viewMode}`}>
        {appMode === 'test' ? (
          <>
            {(viewMode === 'split' || viewMode === 'flow') && <FlowPanel messages={testMessages} />}
            {(viewMode === 'split' || viewMode === 'log') && <LogPanel messages={testMessages} />}
          </>
        ) : (
          <>
            {(viewMode === 'split' || viewMode === 'flow') && (
              <FlowPanelLive messages={liveMessages} />
            )}
            {(viewMode === 'split' || viewMode === 'log') && (
              <LogPanelLive messages={liveMessages} />
            )}
          </>
        )}
      </div>

      {appMode === 'test' && <TokenBar tokens={tokens} />}
    </div>
  )
}
