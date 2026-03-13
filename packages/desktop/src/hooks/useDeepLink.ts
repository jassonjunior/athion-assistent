/**
 * useDeepLink
 * Descrição: Hook que registra listeners para deep links do protocolo `athion://`.
 * Deve ser montado na raiz do App (uma única vez).
 * Callbacks são disparados quando a URL correspondente é aberta.
 *
 * Eventos suportados:
 *  - deep-link:session  -> athion://chat?session=<id>
 *  - deep-link:message  -> athion://chat?message=<texto>
 *  - deep-link:new      -> athion://new
 *  - deep-link:config   -> athion://config?key=<k>&value=<v>
 */

import { useEffect } from 'react'
import * as bridge from '../bridge/tauri-bridge.js'

/** UseDeepLinkCallbacks
 * Descrição: Callbacks opcionais para cada tipo de deep link suportado
 */
interface UseDeepLinkCallbacks {
  /** Callback disparado ao receber deep link de sessão (athion://chat?session=<id>) */
  onSession?: (sessionId: string) => void
  /** Callback disparado ao receber deep link de mensagem (athion://chat?message=<texto>) */
  onMessage?: (message: string) => void
  /** Callback disparado ao receber deep link de novo chat (athion://new) */
  onNew?: () => void
  /** Callback disparado ao receber deep link de configuração (athion://config?key=<k>&value=<v>) */
  onConfig?: (key: string, value: string) => void
}

/** useDeepLink
 * Descrição: Registra e gerencia listeners de deep link via bridge Tauri, removendo-os na desmontagem
 * @param callbacks - Objeto com callbacks opcionais para cada tipo de deep link
 */
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
