/**
 * useDeepLink — Registra listeners para deep links `athion://`.
 *
 * Deve ser montado na raiz do App (uma única vez).
 * Callbacks disparados quando a URL correspondente é aberta.
 *
 * Eventos suportados:
 *  - deep-link:session  → athion://chat?session=<id>
 *  - deep-link:message  → athion://chat?message=<texto>
 *  - deep-link:new      → athion://new
 *  - deep-link:config   → athion://config?key=<k>&value=<v>
 */

import { useEffect } from 'react'
import * as bridge from '../bridge/tauri-bridge.js'

interface UseDeepLinkCallbacks {
  onSession?: (sessionId: string) => void
  onMessage?: (message: string) => void
  onNew?: () => void
  onConfig?: (key: string, value: string) => void
}

export function useDeepLink(callbacks: UseDeepLinkCallbacks): void {
  const { onSession, onMessage, onNew, onConfig } = callbacks

  useEffect(() => {
    const unlisteners: Promise<() => void>[] = []

    if (onSession) {
      unlisteners.push(bridge.onDeepLinkSession(onSession))
    }
    if (onMessage) {
      unlisteners.push(bridge.onDeepLinkMessage(onMessage))
    }
    if (onNew) {
      unlisteners.push(bridge.onDeepLinkNew(onNew))
    }
    if (onConfig) {
      unlisteners.push(bridge.onDeepLinkConfig(onConfig))
    }

    return () => {
      for (const p of unlisteners) {
        p.then((fn) => fn())
      }
    }
  }, [onSession, onMessage, onNew, onConfig])
}
