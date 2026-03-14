/**
 * StatusBar
 * Descrição: Barra inferior que exibe o status atual de conexão com o sidecar.
 */

import type { SidecarStatus } from '../bridge/types.js'

/** StatusBarProps
 * Descrição: Propriedades do componente StatusBar
 */
interface StatusBarProps {
  /** Status atual da conexão com o sidecar */
  status: SidecarStatus
}

/** statusLabels
 * Descrição: Mapeamento de status do sidecar para labels traduzidos em português
 */
const statusLabels: Record<SidecarStatus, string> = {
  starting: 'Iniciando...',
  ready: 'Conectado',
  error: 'Erro de conexão',
  stopped: 'Desconectado',
}

/** statusColors
 * Descrição: Mapeamento de status do sidecar para classes de cor do indicador visual
 */
const statusColors: Record<SidecarStatus, string> = {
  starting: 'bg-warning-500',
  ready: 'bg-success-500',
  error: 'bg-error-500',
  stopped: 'bg-neutral-500',
}

/** StatusBar
 * Descrição: Componente que renderiza a barra de status com indicador visual colorido e label do estado de conexão
 * @param status - Estado atual da conexão com o sidecar
 * @returns Elemento JSX da barra de status
 */
export function StatusBar({ status }: StatusBarProps) {
  return (
    <div className="flex items-center gap-2 border-t border-surface-800 bg-surface-950 px-3 py-1 text-xs text-neutral-500">
      <span className={`inline-block h-2 w-2 rounded-full ${statusColors[status]}`} />
      <span>{statusLabels[status]}</span>
    </div>
  )
}
