/**
 * GraphApp
 * Descrição: React app para visualização interativa do DependencyGraph.
 * Usa ReactFlow com Dagre layout para posicionamento automático de nós.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { layoutGraph } from './layout.js'

/* ─── Types ─────────────────────────────────────────────────────── */

interface SerializedGraphData {
  version: number
  files: string[]
  edges: Array<{ from: string; to: string }>
  stats: { totalFiles: number; totalEdges: number }
  exportedAt: string
}

interface VsCodeMessage {
  type: 'graphData' | 'loading' | 'error'
  data?: SerializedGraphData
  focusFile?: string
  message?: string
}

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void
  getState(): unknown
  setState(state: unknown): void
}

const vscode = acquireVsCodeApi()

/* ─── Status Screens ────────────────────────────────────────────── */

function LoadingScreen() {
  return (
    <div className="graph-status">
      <div className="spinner" />
      <p>Loading dependency graph...</p>
    </div>
  )
}

function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="graph-status error">
      <p>Error loading graph</p>
      <p className="detail">{message}</p>
      <button onClick={onRetry}>Retry</button>
    </div>
  )
}

function EmptyScreen() {
  return (
    <div className="graph-status">
      <p>No dependency data available.</p>
      <p className="detail">Index the codebase first using &quot;Athion: Index Codebase&quot;</p>
    </div>
  )
}

/* ─── Main Component ────────────────────────────────────────────── */

export function GraphApp() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'empty'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [stats, setStats] = useState({ files: 0, edges: 0 })

  useEffect(() => {
    const handler = (event: MessageEvent<VsCodeMessage>) => {
      const msg = event.data
      switch (msg.type) {
        case 'loading':
          setStatus('loading')
          break
        case 'error':
          setStatus('error')
          setErrorMsg(msg.message ?? 'Unknown error')
          break
        case 'graphData':
          if (!msg.data || msg.data.files.length === 0) {
            setStatus('empty')
            return
          }
          setStats({ files: msg.data.files.length, edges: msg.data.edges.length })
          setStatus('ready')
          {
            const result = layoutGraph(msg.data.files, msg.data.edges, msg.focusFile)
            setNodes(result.nodes)
            setEdges(result.edges)
          }
          break
      }
    }
    window.addEventListener('message', handler)
    vscode.postMessage({ type: 'ready' })
    return () => window.removeEventListener('message', handler)
  }, [setNodes, setEdges])

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    const fullPath = (node.data as { fullPath?: string }).fullPath
    if (fullPath) vscode.postMessage({ type: 'openFile', filePath: fullPath })
  }, [])

  const onRefresh = useCallback(() => {
    vscode.postMessage({ type: 'refresh' })
  }, [])

  if (status === 'loading') return <LoadingScreen />
  if (status === 'error') return <ErrorScreen message={errorMsg} onRetry={onRefresh} />
  if (status === 'empty') return <EmptyScreen />

  return (
    <div className="graph-container">
      <div className="graph-toolbar">
        <span className="graph-stats">
          {stats.files} files &middot; {stats.edges} edges
        </span>
        <button className="graph-refresh" onClick={onRefresh} title="Refresh">
          ↻
        </button>
      </div>
      <div className="graph-flow">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.1}
          maxZoom={2}
        >
          <Background gap={16} size={1} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeStrokeWidth={3}
            pannable
            zoomable
            style={{ background: 'var(--vscode-editor-background, #1e1e1e)' }}
          />
        </ReactFlow>
      </div>
    </div>
  )
}
