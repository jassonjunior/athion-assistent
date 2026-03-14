import { useEffect, useRef } from 'react'
import type { WsServerMessage } from '../../server/protocol'
import { isTauri } from '../utils/platform'

/**
 * Sends native desktop notifications when tests finish,
 * but only if the window is not focused (avoids spam).
 * Uses Tauri notification plugin when in desktop, Web Notification API otherwise.
 */
export function useDesktopNotification(messages: WsServerMessage[]) {
  const lastNotifiedIndex = useRef(0)

  useEffect(() => {
    if (!document.hidden) return

    const newMessages = messages.slice(lastNotifiedIndex.current)
    lastNotifiedIndex.current = messages.length

    for (const msg of newMessages) {
      if (msg.type !== 'test:finished') continue

      const { testName, passed, duration } = msg
      const seconds = (duration / 1000).toFixed(1)
      const title = passed ? 'Teste passou' : 'Teste falhou'
      const body = `${passed ? '\u2705' : '\u274C'} ${testName} (${seconds}s)`

      if (isTauri()) {
        // Use Tauri invoke to send notification from Rust side
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any
        if (w.__TAURI_INTERNALS__?.invoke) {
          w.__TAURI_INTERNALS__
            .invoke('plugin:notification|notify', { title, body })
            .catch(() => {})
        }
      } else if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body })
      }
    }
  }, [messages])
}
