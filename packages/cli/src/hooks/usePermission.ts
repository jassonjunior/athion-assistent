/**
 * usePermission — Gerencia requisições de permissão interativas na TUI.
 * Descrição: Fornece um callback `requestPermission` para o `useChat` via `onPermissionRequest`.
 * Quando uma tool requer aprovação, o hook expõe `pendingRequest` para o componente
 * PermissionPrompt renderizar o diálogo.
 */

import { useCallback, useState } from 'react'
import type { AthionCore, PermissionDecision, PermissionScope } from '@athion/core'

/** PendingPermissionRequest
 * Descrição: Representa uma requisição de permissão aguardando decisão do usuário.
 */
export interface PendingPermissionRequest {
  /** Identificador único da requisição */
  id: string
  /** Nome da ferramenta que requer permissão */
  toolName: string
  /** Alvo da operação (arquivo, diretório, etc.) */
  target: string
  /** Função para resolver a Promise com a decisão do usuário */
  resolve: (decision: 'allow' | 'deny') => void
}

/** UsePermissionReturn
 * Descrição: Retorno do hook usePermission com estado e ações de permissão.
 */
interface UsePermissionReturn {
  /** Requisição de permissão aguardando resposta do usuário (null se nenhuma). */
  pendingRequest: PendingPermissionRequest | null
  /**
   * Callback para passar em `useChat` via `onPermissionRequest`.
   * Pausa a execução da tool até o usuário decidir.
   */
  requestPermission: (toolName: string, target: string) => Promise<'allow' | 'deny'>
  /** Aprova a requisição pendente com o escopo informado. */
  grant: (decision: PermissionDecision, scope: PermissionScope) => void
  /** Nega a requisição pendente. */
  deny: () => void
}

/** usePermission
 * Descrição: Hook React que gerencia o fluxo de requisição e resposta de permissões para tools.
 * @param core - Instância do core do Athion para persistência de regras de permissão
 * @returns Objeto com estado da requisição pendente e funções para aprovar/negar
 */
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
