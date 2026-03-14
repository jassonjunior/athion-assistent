/**
 * ToolCallCard
 * Descrição: Componente de card para exibir uma tool call com status visual (running/success/error).
 */

import type { ToolCallInfo } from '../hooks/useChat.js'

/**
 * ToolCallCardProps
 * Descrição: Props do componente ToolCallCard.
 */
interface ToolCallCardProps {
  /** Informações da tool call a ser exibida */
  toolCall: ToolCallInfo
}

/**
 * ToolCallCard
 * Descrição: Renderiza um card com o nome da ferramenta, ícone de status e preview do resultado.
 * @param toolCall - Objeto com informações da tool call (nome, status, resultado)
 * @returns Elemento JSX do card de tool call
 */
export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const statusIcon =
    toolCall.status === 'running' ? '...' : toolCall.status === 'success' ? '✓' : '✗'

  return (
    <div className={`tool-call-card ${toolCall.status}`}>
      <div className="tool-call-header">
        <span className="tool-call-icon">{statusIcon}</span>
        <span className="tool-call-name">{toolCall.name}</span>
      </div>
      {toolCall.result && (
        <div className="tool-call-result">
          <pre>{toolCall.result.slice(0, 300)}</pre>
        </div>
      )}
    </div>
  )
}
