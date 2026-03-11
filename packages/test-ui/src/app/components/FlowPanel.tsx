import { ReactFlow, Controls, MiniMap, Background, BackgroundVariant } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { WsServerMessage } from '../../server/protocol'
import { useFlowGraph } from '../hooks/useFlowGraph'
import { nodeTypes } from '../nodes'

interface FlowPanelProps {
  messages: WsServerMessage[]
}

export function FlowPanel({ messages }: FlowPanelProps) {
  const { nodes, edges } = useFlowGraph(messages)

  if (nodes.length === 0) {
    return (
      <div className="flow-panel flow-empty">
        <div className="flow-empty-text">
          <span style={{ fontSize: 48, opacity: 0.3 }}>⬡</span>
          <p>Run a test to see the execution flow</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flow-panel">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          style: { stroke: '#45475a', strokeWidth: 2 },
          type: 'smoothstep',
        }}
      >
        <Background variant={BackgroundVariant.Dots} color="#313244" gap={20} />
        <Controls style={{ background: '#1e1e2e', borderColor: '#313244' }} />
        <MiniMap
          style={{ background: '#11111b' }}
          nodeColor={(node) => {
            const status = (node.data as { status?: string }).status
            if (status === 'error') return '#ef4444'
            if (status === 'success') return '#10b981'
            if (status === 'running') return '#f59e0b'
            return '#45475a'
          }}
        />
      </ReactFlow>
    </div>
  )
}
