/**
 * Sidebar
 * Descrição: Painel lateral com lista de sessões de chat, permitindo criar, selecionar e recolher.
 */

import { useCallback, useEffect, useState } from 'react'
import * as bridge from '../bridge/tauri-bridge.js'
import type { SessionInfo } from '../bridge/types.js'

/** SidebarProps
 * Descrição: Propriedades do componente Sidebar
 */
interface SidebarProps {
  /** Identificador da sessão atualmente selecionada */
  currentSessionId: string | null
  /** Callback disparado ao selecionar uma sessão */
  onSelectSession: (id: string) => void
  /** Callback disparado ao criar uma nova sessão */
  onNewSession: () => void
  /** Indica se a sidebar está recolhida */
  isCollapsed: boolean
  /** Callback para alternar entre expandido e recolhido */
  onToggle: () => void
}

/** Sidebar
 * Descrição: Componente de barra lateral que exibe a lista de sessões de chat e permite navegação entre elas
 * @param currentSessionId - ID da sessão ativa
 * @param onSelectSession - Callback ao clicar em uma sessão
 * @param onNewSession - Callback ao criar nova sessão
 * @param isCollapsed - Estado de visibilidade da sidebar
 * @param onToggle - Callback para expandir/recolher a sidebar
 * @returns Elemento JSX da sidebar com lista de sessões
 */
export function Sidebar({
  currentSessionId,
  onSelectSession,
  onNewSession,
  isCollapsed,
  onToggle,
}: SidebarProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([])

  /** loadSessions
   * Descrição: Carrega a lista de sessões do sidecar via bridge
   */
  const loadSessions = useCallback(async () => {
    try {
      const list = await bridge.sessionList()
      setSessions(list)
    } catch {
      // sidecar not ready yet
    }
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions, currentSessionId])

  if (isCollapsed) {
    return (
      <div className="flex w-10 flex-col items-center border-r border-surface-800 bg-surface-950 pt-3">
        <button
          onClick={onToggle}
          className="text-neutral-500 hover:text-neutral-300"
          title="Expandir"
        >
          ▶
        </button>
      </div>
    )
  }

  return (
    <div className="flex w-60 flex-col border-r border-surface-800 bg-surface-950">
      <div className="flex items-center justify-between border-b border-surface-800 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Sessões
        </span>
        <div className="flex gap-1">
          <button
            onClick={onNewSession}
            className="text-neutral-500 hover:text-neutral-300"
            title="Nova sessão"
          >
            +
          </button>
          <button
            onClick={onToggle}
            className="text-neutral-500 hover:text-neutral-300"
            title="Recolher"
          >
            ◀
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelectSession(s.id)}
            className={`w-full px-3 py-2 text-left text-sm transition-colors ${
              s.id === currentSessionId
                ? 'bg-accent-600/20 text-accent-400'
                : 'text-neutral-400 hover:bg-surface-800'
            }`}
          >
            <div className="truncate">{s.title || 'Sem título'}</div>
            <div className="text-xs text-neutral-600">
              {new Date(s.createdAt).toLocaleDateString()}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
