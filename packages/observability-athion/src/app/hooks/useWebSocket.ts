import { useCallback, useEffect, useRef, useState } from 'react'
import type { WsClientMessage, WsServerMessage } from '../../server/protocol'

/** Maximum number of messages kept in memory (FIFO) */
const MAX_MESSAGES = 5000

/** Max reconnect attempts before giving up */
const MAX_RECONNECT_ATTEMPTS = 20

/** Max backoff delay in ms */
const MAX_BACKOFF_MS = 30_000

export interface UseWebSocketReturn {
  connected: boolean
  messages: WsServerMessage[]
  send: (msg: WsClientMessage) => void
  clearMessages: () => void
}

export function useWebSocket(url: string): UseWebSocketReturn {
  const [connected, setConnected] = useState(false)
  const [messages, setMessages] = useState<WsServerMessage[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const reconnectAttempts = useRef(0)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      reconnectAttempts.current = 0
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsServerMessage
        setMessages((prev) => {
          const next = [...prev, msg]
          return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next
        })
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
      if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(1000 * 2 ** reconnectAttempts.current, MAX_BACKOFF_MS)
        reconnectAttempts.current++
        reconnectTimer.current = setTimeout(connect, delay)
      }
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [url])

  useEffect(() => {
    reconnectAttempts.current = 0
    connect()
    return () => {
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((msg: WsClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return { connected, messages, send, clearMessages }
}
