/**
 * ToolCallCard — Card de tool call com status (running/success/error).
 */

import type { ToolCallInfo } from '../hooks/useChat.js'

interface ToolCallCardProps {
  toolCall: ToolCallInfo
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const statusIcon =
    toolCall.status === 'running' ? '...' : toolCall.status === 'success' ? '✓' : '✗'

  return (
    <div className={`tool-call-card ${toolCall.status}`}>
      <div className="tool-call-header">
        <span className="tool-call-icon">{statusIcon}</span>
        <span className="tool-call-name">{toolCall.name}</span>
      </div>
      {toolCall.result && (
        <div className="tool-call-result">
          <pre>{toolCall.result.slice(0, 300)}</pre>
        </div>
      )}
    </div>
  )
}
