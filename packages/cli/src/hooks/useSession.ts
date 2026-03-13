/**
 * useSession — Gerencia sessões de conversa na TUI.
 * Descrição: Expõe listagem, criação, troca e exclusão de sessões consumindo diretamente o core.orchestrator.
 */

import { useCallback, useState } from 'react'
import type { AthionCore, Session } from '@athion/core'

/** UseSessionReturn
 * Descrição: Retorno do hook useSession com estado e ações de gerenciamento de sessões.
 */
interface UseSessionReturn {
  /** Sessão de conversa ativa atualmente */
  session: Session
  /** Lista de todas as sessões do projeto CLI */
  sessions: Session[]
  /** Indica se uma operação de sessão está em andamento */
  isLoading: boolean
  /** Cria uma nova sessão com título opcional */
  createSession: (title?: string) => Promise<Session>
  /** Carrega uma sessão existente pelo ID */
  loadSession: (id: string) => Promise<Session>
  /** Deleta uma sessão pelo ID */
  deleteSession: (id: string) => void
  /** Troca para outra sessão pelo ID */
  switchSession: (id: string) => Promise<void>
}

/** useSession
 * Descrição: Hook React que gerencia o ciclo de vida das sessões de conversa na interface do CLI.
 * @param core - Instância do core do Athion para operações de sessão
 * @param initialSession - Sessão inicial a ser usada como estado padrão
 * @returns Objeto com sessão ativa, lista de sessões e funções de gerenciamento
 */
export function useSession(core: AthionCore, initialSession: Session): UseSessionReturn {
  const [session, setSession] = useState<Session>(initialSession)
  const [sessions, setSessions] = useState<Session[]>(() => core.orchestrator.listSessions('cli'))
  const [isLoading, setIsLoading] = useState(false)

  /** refreshList
   * Descrição: Atualiza a lista de sessões a partir do orchestrator.
   */
  const refreshList = useCallback(() => {
    setSessions(core.orchestrator.listSessions('cli'))
  }, [core])

  /** createSession
   * Descrição: Cria uma nova sessão de conversa e a define como ativa.
   * @param title - Título opcional para a nova sessão
   * @returns Promise com a sessão recém-criada
   */
  const createSession = useCallback(
    async (title?: string): Promise<Session> => {
      setIsLoading(true)
      try {
        const newSession = await core.orchestrator.createSession('cli', title)
        setSession(newSession)
        refreshList()
        return newSession
      } finally {
        setIsLoading(false)
      }
    },
    [core, refreshList],
  )

  /** loadSession
   * Descrição: Carrega uma sessão existente pelo ID e a define como ativa.
   * @param id - Identificador da sessão a ser carregada
   * @returns Promise com a sessão carregada
   */
  const loadSession = useCallback(
    async (id: string): Promise<Session> => {
      setIsLoading(true)
      try {
        const loaded = await core.orchestrator.loadSession(id)
        setSession(loaded)
        return loaded
      } finally {
        setIsLoading(false)
      }
    },
    [core],
  )

  /** deleteSession
   * Descrição: Deleta uma sessão pelo ID. Se for a sessão ativa, cria uma nova automaticamente.
   * @param id - Identificador da sessão a ser deletada
   */
  const deleteSession = useCallback(
    (id: string): void => {
      core.orchestrator.deleteSession(id)
      refreshList()
      // Se deletou a sessão ativa, cria uma nova automaticamente
      if (id === session.id) {
        void core.orchestrator.createSession('cli').then((s) => setSession(s))
      }
    },
    [core, session.id, refreshList],
  )

  /** switchSession
   * Descrição: Troca para outra sessão de conversa pelo ID.
   * @param id - Identificador da sessão de destino
   * @returns Promise que resolve quando a troca é concluída
   */
  const switchSession = useCallback(
    async (id: string): Promise<void> => {
      await loadSession(id)
    },
    [loadSession],
  )

  return { session, sessions, isLoading, createSession, loadSession, deleteSession, switchSession }
}
