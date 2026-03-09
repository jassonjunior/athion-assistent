/**
 * DiffView — Visualização de diff inline no chat.
 * Mostra linhas adicionadas (verde) e removidas (vermelho).
 */

interface DiffViewProps {
  diff: string
}

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
