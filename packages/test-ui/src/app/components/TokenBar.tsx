import type { TokenTrackerState } from '../hooks/useTokenTracker'

interface TokenBarProps {
  tokens: TokenTrackerState
}

export function TokenBar({ tokens }: TokenBarProps) {
  const barColor =
    tokens.percentUsed > 80 ? '#ef4444' : tokens.percentUsed > 50 ? '#f59e0b' : '#10b981'

  return (
    <div className="token-bar">
      <div className="token-bar-info">
        <span>
          Token Limit: <strong>{tokens.contextLimit.toLocaleString()}</strong>
        </span>
        <span>
          Token Usage: <strong>{tokens.totalUsed.toLocaleString()}</strong>
        </span>
        <span>
          Input: <strong>{tokens.estimatedInput.toLocaleString()}</strong>
        </span>
        <span>
          Output: <strong>{tokens.estimatedOutput.toLocaleString()}</strong>
        </span>
        <span style={{ color: barColor, fontWeight: 'bold' }}>{tokens.percentUsed}% Used</span>
      </div>
      <div className="token-bar-track">
        <div
          className="token-bar-fill"
          style={{
            width: `${Math.min(100, tokens.percentUsed)}%`,
            backgroundColor: barColor,
          }}
        />
      </div>
    </div>
  )
}
