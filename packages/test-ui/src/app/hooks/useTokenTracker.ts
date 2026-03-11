import { useMemo } from 'react'
import type { TokenSnapshot, WsServerMessage } from '../../server/protocol'

export interface TokenTrackerState {
  contextLimit: number
  totalUsed: number
  percentUsed: number
  estimatedInput: number
  estimatedOutput: number
}

const EMPTY: TokenTrackerState = {
  contextLimit: 50_000,
  totalUsed: 0,
  percentUsed: 0,
  estimatedInput: 0,
  estimatedOutput: 0,
}

/** Extrai o último TokenSnapshot de uma lista de mensagens */
export function useTokenTracker(messages: WsServerMessage[]): TokenTrackerState {
  return useMemo(() => {
    let latest: TokenSnapshot | null = null

    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      if ('tokens' in msg && msg.tokens) {
        latest = msg.tokens as TokenSnapshot
        break
      }
    }

    if (!latest) return EMPTY

    return {
      contextLimit: latest.contextLimit,
      totalUsed: latest.totalUsed,
      percentUsed: latest.percentUsed,
      estimatedInput: latest.estimatedInput,
      estimatedOutput: latest.estimatedOutput,
    }
  }, [messages])
}
