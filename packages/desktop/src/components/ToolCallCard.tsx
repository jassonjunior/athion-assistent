/**
 * ToolCallCard — Card de tool call com status (running/success/error).
 */

import type { ToolCallInfo } from '../hooks/useChat.js'

interface ToolCallCardProps {
  toolCall: ToolCallInfo
}

const statusStyles = {
  running: 'border-l-accent-400 bg-surface-800',
  success: 'border-l-success-500 bg-surface-800',
  error: 'border-l-error-500 bg-surface-800',
} as const

const statusIcons = {
  running: '⟳',
  success: '✓',
  error: '✗',
} as const

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  return (
    <div className={`rounded-r-lg border-l-2 px-3 py-2 text-xs ${statusStyles[toolCall.status]}`}>
      <div className="flex items-center gap-2 font-medium text-neutral-300">
        <span>{statusIcons[toolCall.status]}</span>
        <span>{toolCall.name}</span>
      </div>
      {toolCall.result && (
        <pre className="mt-1 max-h-20 overflow-auto text-neutral-500">
          {toolCall.result.slice(0, 300)}
        </pre>
      )}
    </div>
  )
}
