/**
 * MentionDropdown
 * Descrição: Dropdown de sugestões de @mention ao digitar `@` no input de chat.
 * Renderiza sobre o textarea (position: absolute) com navegação por teclado.
 */

import type { MentionResult } from '../hooks/useAtMention.js'

/**
 * MentionDropdownProps
 * Descrição: Props do componente MentionDropdown.
 */
interface MentionDropdownProps {
  /** Lista de resultados de menção encontrados */
  results: MentionResult[]
  /** Índice do item atualmente selecionado por teclado */
  selectedIndex: number
  /** Query atual de busca (texto após @) */
  query: string
  /** Callback chamado quando o usuário seleciona um resultado */
  onSelect: (result: MentionResult) => void
}

/**
 * MentionDropdown
 * Descrição: Renderiza uma lista de sugestões de arquivos/símbolos para @mention.
 * Suporta navegação por teclado via selectedIndex e seleção por clique.
 * @param results - Resultados de busca de menção
 * @param selectedIndex - Índice do item selecionado
 * @param query - Query de busca atual
 * @param onSelect - Callback de seleção
 * @returns Elemento JSX do dropdown ou null se não houver resultados
 */
export function MentionDropdown({ results, selectedIndex, query, onSelect }: MentionDropdownProps) {
  if (results.length === 0) return null

  return (
    <div className="mention-dropdown" role="listbox" aria-label={`Menções para @${query}`}>
      {results.map((result, index) => {
        const fileName = result.file.split('/').pop() ?? result.file
        const dirPath = result.file.includes('/')
          ? result.file.slice(0, result.file.lastIndexOf('/'))
          : ''
        const isSelected = index === selectedIndex

        return (
          <button
            key={`${result.file}:${result.startLine}`}
            role="option"
            aria-selected={isSelected}
            className={`mention-item${isSelected ? ' mention-item--selected' : ''}`}
            onMouseDown={(e) => {
              e.preventDefault() // evita perda de foco no textarea
              onSelect(result)
            }}
          >
            <span className="mention-item__icon">{getChunkIcon(result.chunkType)}</span>
            <span className="mention-item__name">
              {result.symbolName ? (
                <>
                  <span className="mention-item__symbol">{result.symbolName}</span>
                  <span className="mention-item__file"> — {fileName}</span>
                </>
              ) : (
                <span className="mention-item__file">{fileName}</span>
              )}
            </span>
            {dirPath && <span className="mention-item__dir">{dirPath}</span>}
            <span className="mention-item__line">:{result.startLine}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * getChunkIcon
 * Descrição: Retorna o ícone correspondente ao tipo de chunk do código.
 * @param chunkType - Tipo do chunk (function, class, method, etc.)
 * @returns Caractere de ícone representando o tipo
 */
function getChunkIcon(chunkType: string): string {
  if (chunkType === 'function') return 'ƒ'
  if (chunkType === 'class') return '◆'
  if (chunkType === 'method') return '◇'
  return '·'
}
