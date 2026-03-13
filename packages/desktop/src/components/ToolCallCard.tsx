/**
 * ToolCallCard
 * Descrição: Card que exibe informações de uma chamada de ferramenta (tool call) com indicador de status.
 */

import type { ToolCallInfo } from '../hooks/useChat.js'

/** ToolCallCardProps
 * Descrição: Propriedades do componente ToolCallCard
 */
interface ToolCallCardProps {
  /** Informações da chamada de ferramenta a ser exibida */
  toolCall: ToolCallInfo
}

/** statusStyles
 * Descrição: Mapeamento de status da tool call para classes CSS de estilo do card
 */
const statusStyles = {
  running: 'border-l-accent-400 bg-surface-800',
  success: 'border-l-success-500 bg-surface-800',
  error: 'border-l-error-500 bg-surface-800',
} as const

/** statusIcons
 * Descrição: Mapeamento de status da tool call para ícones indicadores visuais
 */
const statusIcons = {
  running: '⟳',
  success: '✓',
  error: '✗',
} as const

/** ToolCallCard
 * Descrição: Componente que renderiza um card com nome da ferramenta, status e preview do resultado
 * @param toolCall - Objeto com informações da chamada de ferramenta
 * @returns Elemento JSX do card da tool call
 */
export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  return (
    <div className={`rounded-r-lg border-l-2 px-3 py-2 text-xs ${statusStyles[toolCall.status]}`}>
      <div className="flex items-center gap-2 font-medium text-neutral-300">
        <span>{statusIcons[toolCall.status]}</span>
        <span>{toolCall.name}</span>
      </div>
      {toolCall.result && (
        <pre className="mt-1 max-h-20 overflow-auto text-neutral-500">
          {toolCall.result.slice(0, 300)}
        </pre>
      )}
    </div>
  )
}
