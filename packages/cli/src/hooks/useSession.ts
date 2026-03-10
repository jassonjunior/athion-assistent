/**
 * useSession — Gerencia sessoes de conversa na TUI.
 *
 * Expoe listagem, criacao, troca e exclusao de sessoes
 * consumindo diretamente o core.orchestrator.
 */

import { useCallback, useState } from 'react'
import type { AthionCore, Session } from '@athion/core'

interface UseSessionReturn {
  session: Session
  sessions: Session[]
  isLoading: boolean
  createSession: (title?: string) => Promise<Session>
  loadSession: (id: string) => Promise<Session>
  deleteSession: (id: string) => void
  switchSession: (id: string) => Promise<void>
}

export function useSession(core: AthionCore, initialSession: Session): UseSessionReturn {
  const [session, setSession] = useState<Session>(initialSession)
  const [sessions, setSessions] = useState<Session[]>(() => core.orchestrator.listSessions('cli'))
  const [isLoading, setIsLoading] = useState(false)

  const refreshList = useCallback(() => {
    setSessions(core.orchestrator.listSessions('cli'))
  }, [core])

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

  const deleteSession = useCallback(
    (id: string): void => {
      core.orchestrator.deleteSession(id)
      refreshList()
      // Se deletou a sessao ativa, cria uma nova automaticamente
      if (id === session.id) {
        void core.orchestrator.createSession('cli').then((s) => setSession(s))
      }
    },
    [core, session.id, refreshList],
  )

  const switchSession = useCallback(
    async (id: string): Promise<void> => {
      await loadSession(id)
    },
    [loadSession],
  )

  return { session, sessions, isLoading, createSession, loadSession, deleteSession, switchSession }
}
