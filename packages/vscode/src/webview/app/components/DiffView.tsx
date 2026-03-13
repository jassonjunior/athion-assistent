/**
 * DiffView
 * Descrição: Componente de visualização de diff inline no chat.
 * Mostra linhas adicionadas (verde), removidas (vermelho) e headers de hunk.
 */

/**
 * DiffViewProps
 * Descrição: Props do componente DiffView.
 */
interface DiffViewProps {
  /** String do diff em formato unificado */
  diff: string
}

/**
 * DiffView
 * Descrição: Renderiza um diff textual com coloração por tipo de linha (adicionada, removida, hunk).
 * @param diff - String de diff em formato unificado
 * @returns Elemento JSX da visualização de diff
 */
export function DiffView({ diff }: DiffViewProps) {
  const lines = diff.split('\n')

  return (
    <div className="diff-view">
      {lines.map((line, i) => {
        let className = 'diff-line'
        if (line.startsWith('+') && !line.startsWith('+++')) {
          className += ' added'
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          className += ' removed'
        } else if (line.startsWith('@@')) {
          className += ' hunk'
        }

        return (
          <div key={i} className={className}>
            {line}
          </div>
        )
      })}
    </div>
  )
}
