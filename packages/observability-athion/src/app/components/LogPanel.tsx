import { useMemo } from 'react'
import type { WsServerMessage } from '../../server/protocol'
import type { LogEntry } from './LogPanelBase'
import { LogPanelBase } from './LogPanelBase'

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
      return `Test ${msg.passed ? 'PASSED \u2713' : 'FAILED \u2717'} (${(msg.duration / 1000).toFixed(1)}s)`
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
      return `Tool result: ${msg.name} \u2192 ${msg.success ? '\u2713' : '\u2717'} ${msg.preview.slice(0, 100)}`
    case 'orch:subagent_start':
      return `\u25B8 SubAgent started: ${msg.agentName}`
    case 'orch:subagent_complete':
      return `\u25B8 SubAgent complete: ${msg.agentName}`
    case 'orch:finish':
      return `Finish: ${msg.promptTokens} in / ${msg.completionTokens} out / ${msg.totalTokens} total`
    case 'orch:error':
      return `ERROR: ${msg.message}`
    case 'sub:start':
      return `  \u21B3 Agent ${msg.agentName}: ${msg.description.slice(0, 100)}`
    case 'sub:content':
      return `  \u21B3 Agent response: ${msg.content.slice(0, 120)}`
    case 'sub:tool_call':
      return `  \u21B3 Tool: ${msg.toolName}(${JSON.stringify(msg.args).slice(0, 100)})`
    case 'sub:tool_result':
      return `  \u21B3 Result: ${msg.toolName} \u2192 ${msg.success ? '\u2713' : '\u2717'} ${msg.preview.slice(0, 80)}`
    case 'sub:continuation':
      return `  \u21B3 Continuation #${msg.continuationIndex + 1} (${msg.accumulatedCount} accumulated)`
    case 'sub:complete':
      return `  \u21B3 Agent complete: ${msg.resultPreview.slice(0, 100)}`
    case 'sub:error':
      return `  \u21B3 Agent ERROR: ${msg.message}`
    default:
      return JSON.stringify(msg)
  }
}

export function LogPanel({ messages }: LogPanelProps) {
  const entries = useMemo<LogEntry[]>(
    () =>
      messages.map((msg, i) => {
        const tokens =
          'tokens' in msg && msg.tokens
            ? `[${msg.tokens.totalUsed.toLocaleString()}/${msg.tokens.contextLimit.toLocaleString()} ${msg.tokens.percentUsed}%]`
            : undefined
        return {
          key: i,
          type: msg.type,
          color: typeColors[msg.type] ?? '#6b7280',
          content: formatMessage(msg),
          tokens,
        }
      }),
    [messages],
  )

  return <LogPanelBase entries={entries} emptyMessage="Select a test and click Run to begin" />
}
