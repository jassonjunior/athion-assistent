/**
 * usePermission — Gerencia requisicoes de permissao interativas na TUI.
 *
 * Fornece um callback `requestPermission` para passar ao `useChat`
 * via `onPermissionRequest`. Quando uma tool requer aprovacao,
 * o hook expoe `pendingRequest` para o componente PermissionPrompt
 * renderizar o dialogo.
 */

import { useCallback, useState } from 'react'
import type { AthionCore, PermissionDecision, PermissionScope } from '@athion/core'

export interface PendingPermissionRequest {
  id: string
  toolName: string
  target: string
  resolve: (decision: 'allow' | 'deny') => void
}

interface UsePermissionReturn {
  /** Requisicao de permissao aguardando resposta do usuario (null se nenhuma). */
  pendingRequest: PendingPermissionRequest | null
  /**
   * Callback para passar em `useChat` via `onPermissionRequest`.
   * Pausa a execucao da tool ate o usuario decidir.
   */
  requestPermission: (toolName: string, target: string) => Promise<'allow' | 'deny'>
  /** Aprova a requisicao pendente com o escopo informado. */
  grant: (decision: PermissionDecision, scope: PermissionScope) => void
  /** Nega a requisicao pendente. */
  deny: () => void
}

export function usePermission(core: AthionCore): UsePermissionReturn {
  const [pendingRequest, setPendingRequest] = useState<PendingPermissionRequest | null>(null)

  const requestPermission = useCallback(
    (toolName: string, target: string): Promise<'allow' | 'deny'> => {
      return new Promise<'allow' | 'deny'>((resolve) => {
        setPendingRequest({ id: crypto.randomUUID(), toolName, target, resolve })
      })
    },
    [],
  )

  const grant = useCallback(
    (decision: PermissionDecision, scope: PermissionScope): void => {
      if (!pendingRequest) return
      // Persiste regra se scope != 'once'
      if (scope !== 'once') {
        core.permissions.grant({
          action: pendingRequest.toolName,
          target: pendingRequest.target,
          decision,
          scope,
        })
      }
      pendingRequest.resolve(decision === 'deny' ? 'deny' : 'allow')
      setPendingRequest(null)
    },
    [pendingRequest, core],
  )

  const deny = useCallback((): void => {
    if (!pendingRequest) return
    pendingRequest.resolve('deny')
    setPendingRequest(null)
  }, [pendingRequest])

  return { pendingRequest, requestPermission, grant, deny }
}
