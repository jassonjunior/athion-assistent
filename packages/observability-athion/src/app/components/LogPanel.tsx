import { useEffect, useRef } from 'react'
import type { WsServerMessage } from '../../server/protocol'

interface LogPanelProps {
  messages: WsServerMessage[]
}

const typeColors: Record<string, string> = {
  'test:started': '#3b82f6',
  'test:finished': '#3b82f6',
  'setup:step': '#6b7280',
  'setup:tools': '#6b7280',
  'setup:agents': '#6b7280',
  'orch:user_message': '#8b5cf6',
  'orch:system_prompt': '#6b7280',
  'orch:content': '#06b6d4',
  'orch:tool_call': '#f59e0b',
  'orch:tool_result': '#10b981',
  'orch:subagent_start': '#a78bfa',
  'orch:subagent_complete': '#a78bfa',
  'orch:finish': '#3b82f6',
  'orch:error': '#ef4444',
  'sub:start': '#c084fc',
  'sub:content': '#67e8f9',
  'sub:tool_call': '#fbbf24',
  'sub:tool_result': '#34d399',
  'sub:continuation': '#f97316',
  'sub:complete': '#34d399',
  'sub:error': '#ef4444',
}

function formatMessage(msg: WsServerMessage): string {
  switch (msg.type) {
    case 'test:started':
      return `Test started: ${msg.testName}`
    case 'test:finished':
      return `Test ${msg.passed ? 'PASSED ✓' : 'FAILED ✗'} (${(msg.duration / 1000).toFixed(1)}s)`
    case 'setup:step':
      return `[${msg.step}] ${msg.detail}`
    case 'setup:tools':
      return `Tools: ${msg.tools.join(', ')}`
    case 'setup:agents':
      return `Agents: ${msg.agents.join(', ')}`
    case 'orch:user_message':
      return `User: ${msg.content.slice(0, 120)}`
    case 'orch:system_prompt':
      return `System prompt (${msg.fullLength} chars): ${msg.preview.slice(0, 80)}`
    case 'orch:content':
      return `LLM: ${msg.content.slice(0, 150)}`
    case 'orch:tool_call':
      return `Tool call: ${msg.name}(${JSON.stringify(msg.args).slice(0, 120)})`
    case 'orch:tool_result':
      return `Tool result: ${msg.name} → ${msg.success ? '✓' : '✗'} ${msg.preview.slice(0, 100)}`
    case 'orch:subagent_start':
      return `▸ SubAgent started: ${msg.agentName}`
    case 'orch:subagent_complete':
      return `▸ SubAgent complete: ${msg.agentName}`
    case 'orch:finish':
      return `Finish: ${msg.promptTokens} in / ${msg.completionTokens} out / ${msg.totalTokens} total`
    case 'orch:error':
      return `ERROR: ${msg.message}`
    case 'sub:start':
      return `  ↳ Agent ${msg.agentName}: ${msg.description.slice(0, 100)}`
    case 'sub:content':
      return `  ↳ Agent response: ${msg.content.slice(0, 120)}`
    case 'sub:tool_call':
      return `  ↳ Tool: ${msg.toolName}(${JSON.stringify(msg.args).slice(0, 100)})`
    case 'sub:tool_result':
      return `  ↳ Result: ${msg.toolName} → ${msg.success ? '✓' : '✗'} ${msg.preview.slice(0, 80)}`
    case 'sub:continuation':
      return `  ↳ Continuation #${msg.continuationIndex + 1} (${msg.accumulatedCount} accumulated)`
    case 'sub:complete':
      return `  ↳ Agent complete: ${msg.resultPreview.slice(0, 100)}`
    case 'sub:error':
      return `  ↳ Agent ERROR: ${msg.message}`
    default:
      return JSON.stringify(msg)
  }
}

function formatTokens(msg: WsServerMessage): string | null {
  if (!('tokens' in msg) || !msg.tokens) return null
  const t = msg.tokens
  return `[${t.totalUsed.toLocaleString()}/${t.contextLimit.toLocaleString()} ${t.percentUsed}%]`
}

export function LogPanel({ messages }: LogPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="log-panel" ref={containerRef}>
      {messages.map((msg, i) => {
        const color = typeColors[msg.type] ?? '#6b7280'
        const tokenStr = formatTokens(msg)

        return (
          <div key={i} className="log-line">
            <span className="log-type" style={{ color }}>
              {msg.type.padEnd(22)}
            </span>
            <span className="log-content">{formatMessage(msg)}</span>
            {tokenStr && (
              <span className="log-tokens" style={{ color }}>
                {tokenStr}
              </span>
            )}
          </div>
        )
      })}
      {messages.length === 0 && (
        <div className="log-empty">Select a test and click Run to begin</div>
      )}
    </div>
  )
}
