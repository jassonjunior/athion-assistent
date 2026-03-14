import { useEffect, useRef } from 'react'
import type { FlowEventMessage } from '../../server/protocol'

interface LogPanelLiveProps {
  messages: FlowEventMessage[]
}

const typeColors: Record<string, string> = {
  user_message: '#8b5cf6',
  system_prompt: '#6b7280',
  llm_content: '#06b6d4',
  tool_call: '#f59e0b',
  tool_result: '#10b981',
  subagent_start: '#a78bfa',
  subagent_content: '#67e8f9',
  subagent_tool_call: '#fbbf24',
  subagent_tool_result: '#34d399',
  subagent_continuation: '#f97316',
  subagent_complete: '#34d399',
  model_loading: '#6b7280',
  model_ready: '#10b981',
  finish: '#3b82f6',
  error: '#ef4444',
}

function formatRelativeTime(ts: number, startTs: number): string {
  const diff = (ts - startTs) / 1000
  return `+${diff.toFixed(1)}s`
}

function formatFlowEvent(msg: FlowEventMessage): string {
  const d = msg.data
  switch (msg.type) {
    case 'user_message':
      return `User: ${String(d.content ?? '').slice(0, 120)}`
    case 'system_prompt':
      return `System prompt (${d.length} chars, ${d.toolCount} tools, ${d.agentCount} agents)`
    case 'llm_content':
      return `LLM: ${String(d.content ?? '').slice(0, 150)}`
    case 'tool_call':
      return `Tool call: ${d.name}(${JSON.stringify(d.args).slice(0, 120)})`
    case 'tool_result':
      return `Tool result: ${d.name} → ${d.success ? '✓' : '✗'}`
    case 'subagent_start':
      return `▸ SubAgent started: ${d.agentName}`
    case 'subagent_content':
      return `  ↳ Agent: ${String(d.content ?? d.text ?? '').slice(0, 120)}`
    case 'subagent_tool_call':
      return `  ↳ Tool: ${d.toolName ?? d.name}(${JSON.stringify(d.args ?? d.input).slice(0, 100)})`
    case 'subagent_tool_result':
      return `  ↳ Result: ${d.toolName ?? d.name} → ${d.success !== false ? '✓' : '✗'}`
    case 'subagent_continuation':
      return `  ↳ Continuation #${Number(d.continuationIndex) + 1}`
    case 'subagent_complete':
      return `▸ SubAgent complete: ${d.agentName}`
    case 'model_loading':
      return `Loading model: ${d.modelName}`
    case 'model_ready':
      return `Model ready: ${d.modelName}`
    case 'finish':
      return `Finish: ${d.promptTokens} in / ${d.completionTokens} out / ${d.totalTokens} total`
    case 'error':
      return `ERROR: ${d.message}`
    default:
      return JSON.stringify(d).slice(0, 150)
  }
}

export function LogPanelLive({ messages }: LogPanelLiveProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const startTs = messages[0]?.timestamp ?? Date.now()

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="log-panel" ref={containerRef}>
      {messages.map((msg, i) => {
        const color = typeColors[msg.type] ?? '#6b7280'
        const relTime = formatRelativeTime(msg.timestamp, startTs)

        return (
          <div key={msg.id ?? i} className={`log-line ${msg.type === 'error' ? 'log-error' : ''}`}>
            <span className="log-time" style={{ color: '#6b7280', minWidth: 60 }}>
              {relTime}
            </span>
            <span className="log-type" style={{ color }}>
              {msg.type.padEnd(22)}
            </span>
            <span className="log-content">{formatFlowEvent(msg)}</span>
          </div>
        )
      })}
      {messages.length === 0 && (
        <div className="log-empty">Waiting for flow events from CLI...</div>
      )}
    </div>
  )
}
