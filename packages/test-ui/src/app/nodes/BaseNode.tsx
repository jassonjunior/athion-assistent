import { useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeData } from '../hooks/useFlowGraph'

interface NodeConfig {
  icon: string
  color: string
}

const statusColors = {
  running: '#f59e0b',
  success: '#10b981',
  error: '#ef4444',
}

export function BaseNode(config: NodeConfig, { data }: { data: NodeData }) {
  const [expanded, setExpanded] = useState(false)
  const borderColor = data.status ? statusColors[data.status] : config.color
  const isRunning = data.status === 'running'
  const hasContent = !!(data.detail || data.preview || data.args)

  return (
    <div
      onClick={() => hasContent && setExpanded(!expanded)}
      style={{
        background: '#1e1e2e',
        border: `2px solid ${borderColor}`,
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 240,
        maxWidth: expanded ? 520 : 320,
        fontFamily: 'monospace',
        fontSize: 12,
        color: '#cdd6f4',
        cursor: hasContent ? 'pointer' : 'default',
        boxShadow: isRunning ? `0 0 12px ${borderColor}40` : '0 2px 8px rgba(0,0,0,0.3)',
        animation: isRunning ? 'pulse 2s infinite' : undefined,
        transition: 'max-width 0.2s ease',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: borderColor }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span>{config.icon}</span>
        <strong style={{ color: '#f5f5f5', fontSize: 13, flex: 1 }}>{data.label}</strong>
        {hasContent && (
          <span style={{ color: '#6b7280', fontSize: 10 }}>{expanded ? '▼' : '▶'}</span>
        )}
      </div>

      {/* Preview (sempre visível, resumida) */}
      {!expanded && data.detail && (
        <div
          style={{
            color: '#a6adc8',
            fontSize: 11,
            maxHeight: 40,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            wordBreak: 'break-word',
          }}
        >
          {String(data.detail).slice(0, 120)}
        </div>
      )}

      {/* Conteúdo expandido */}
      {expanded && (
        <div style={{ marginTop: 4 }}>
          {/* Args (input) */}
          {data.args && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ color: '#89b4fa', fontSize: 10, fontWeight: 'bold', marginBottom: 2 }}>
                INPUT (args)
              </div>
              <pre
                style={{
                  background: '#11111b',
                  border: '1px solid #313244',
                  borderRadius: 4,
                  padding: 6,
                  margin: 0,
                  color: '#a6e3a1',
                  fontSize: 10,
                  maxHeight: 200,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {typeof data.args === 'string' ? data.args : JSON.stringify(data.args, null, 2)}
              </pre>
            </div>
          )}

          {/* Detail (content / result) */}
          {data.detail && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ color: '#89b4fa', fontSize: 10, fontWeight: 'bold', marginBottom: 2 }}>
                {data.args ? 'OUTPUT' : 'CONTENT'}
              </div>
              <pre
                style={{
                  background: '#11111b',
                  border: '1px solid #313244',
                  borderRadius: 4,
                  padding: 6,
                  margin: 0,
                  color: '#cdd6f4',
                  fontSize: 10,
                  maxHeight: 300,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {String(data.detail)}
              </pre>
            </div>
          )}

          {/* Preview (tool result) */}
          {data.preview && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ color: '#89b4fa', fontSize: 10, fontWeight: 'bold', marginBottom: 2 }}>
                RESULT
              </div>
              <pre
                style={{
                  background: '#11111b',
                  border: '1px solid #313244',
                  borderRadius: 4,
                  padding: 6,
                  margin: 0,
                  color: data.status === 'error' ? '#f38ba8' : '#a6e3a1',
                  fontSize: 10,
                  maxHeight: 200,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {data.preview}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Token info */}
      {data.tokens && (
        <div
          style={{
            marginTop: 4,
            fontSize: 10,
            color:
              data.tokens.percentUsed > 80
                ? '#ef4444'
                : data.tokens.percentUsed > 50
                  ? '#f59e0b'
                  : '#6b7280',
            borderTop: '1px solid #313244',
            paddingTop: 3,
          }}
        >
          Tokens: {data.tokens.totalUsed.toLocaleString()} /{' '}
          {data.tokens.contextLimit.toLocaleString()} ({data.tokens.percentUsed}%)
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: borderColor }} />
    </div>
  )
}
