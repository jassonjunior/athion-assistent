/**
 * StatusBar — Barra inferior com status do sidecar.
 */

import type { SidecarStatus } from '../bridge/types.js'

interface StatusBarProps {
  status: SidecarStatus
}

const statusLabels: Record<SidecarStatus, string> = {
  starting: 'Iniciando...',
  ready: 'Conectado',
  error: 'Erro de conexão',
  stopped: 'Desconectado',
}

const statusColors: Record<SidecarStatus, string> = {
  starting: 'bg-warning-500',
  ready: 'bg-success-500',
  error: 'bg-error-500',
  stopped: 'bg-neutral-500',
}

export function StatusBar({ status }: StatusBarProps) {
  return (
    <div className="flex items-center gap-2 border-t border-surface-800 bg-surface-950 px-3 py-1 text-xs text-neutral-500">
      <span className={`inline-block h-2 w-2 rounded-full ${statusColors[status]}`} />
      <span>{statusLabels[status]}</span>
    </div>
  )
}
