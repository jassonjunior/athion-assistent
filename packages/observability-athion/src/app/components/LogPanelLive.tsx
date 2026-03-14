import { useMemo } from 'react'
import type { FlowEventMessage } from '../../server/protocol'
import type { LogEntry } from './LogPanelBase'
import { LogPanelBase } from './LogPanelBase'

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
      return `Tool result: ${d.name} \u2192 ${d.success ? '\u2713' : '\u2717'}`
    case 'subagent_start':
      return `\u25B8 SubAgent started: ${d.agentName}`
    case 'subagent_content':
      return `  \u21B3 Agent: ${String(d.content ?? d.text ?? '').slice(0, 120)}`
    case 'subagent_tool_call':
      return `  \u21B3 Tool: ${d.toolName ?? d.name}(${JSON.stringify(d.args ?? d.input).slice(0, 100)})`
    case 'subagent_tool_result':
      return `  \u21B3 Result: ${d.toolName ?? d.name} \u2192 ${d.success !== false ? '\u2713' : '\u2717'}`
    case 'subagent_continuation':
      return `  \u21B3 Continuation #${Number(d.continuationIndex) + 1}`
    case 'subagent_complete':
      return `\u25B8 SubAgent complete: ${d.agentName}`
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
  const startTs = messages[0]?.timestamp ?? Date.now()

  const entries = useMemo<LogEntry[]>(
    () =>
      messages.map((msg, i) => ({
        key: msg.id ?? i,
        type: msg.type,
        color: typeColors[msg.type] ?? '#6b7280',
        content: formatFlowEvent(msg),
        time: `+${((msg.timestamp - startTs) / 1000).toFixed(1)}s`,
        isError: msg.type === 'error',
      })),
    [messages, startTs],
  )

  return (
    <LogPanelBase entries={entries} emptyMessage="Aguardando eventos do CLI, extensão ou app..." />
  )
}
