import { useEffect, useRef } from 'react'

export interface LogEntry {
  key: string | number
  type: string
  color: string
  content: string
  tokens?: string
  time?: string
  isError?: boolean
}

interface LogPanelBaseProps {
  entries: LogEntry[]
  emptyMessage: string
}

export function LogPanelBase({ entries, emptyMessage }: LogPanelBaseProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wasAtBottom = useRef(true)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // Auto-scroll only if user was already at bottom
    if (wasAtBottom.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [entries])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    wasAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50
  }

  return (
    <div className="log-panel" ref={containerRef} onScroll={handleScroll}>
      {entries.map((entry) => (
        <div key={entry.key} className={`log-line ${entry.isError ? 'log-error' : ''}`}>
          {entry.time && (
            <span className="log-time" style={{ color: '#6b7280', minWidth: 60 }}>
              {entry.time}
            </span>
          )}
          <span className="log-type" style={{ color: entry.color }}>
            {entry.type.padEnd(22)}
          </span>
          <span className="log-content">{entry.content}</span>
          {entry.tokens && (
            <span className="log-tokens" style={{ color: entry.color }}>
              {entry.tokens}
            </span>
          )}
        </div>
      ))}
      {entries.length === 0 && <div className="log-empty">{emptyMessage}</div>}
    </div>
  )
}
