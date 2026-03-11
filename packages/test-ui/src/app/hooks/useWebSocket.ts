import { useCallback, useEffect, useRef, useState } from 'react'
import type { WsClientMessage, WsServerMessage } from '../../server/protocol'

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

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as WsServerMessage
        setMessages((prev) => [...prev, msg])
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
      // Reconnect after 2s
      reconnectTimer.current = setTimeout(connect, 2000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [url])

  useEffect(() => {
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
