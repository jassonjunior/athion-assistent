/**
 * MentionDropdown — Dropdown de sugestões ao digitar `@` no input.
 *
 * Renderiza sobre o textarea (position: absolute).
 * Suporte a navegação por teclado via selectedIndex vindo do useAtMention.
 */

import type { MentionResult } from '../hooks/useAtMention.js'

interface MentionDropdownProps {
  results: MentionResult[]
  selectedIndex: number
  query: string
  onSelect: (result: MentionResult) => void
}

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

function getChunkIcon(chunkType: string): string {
  if (chunkType === 'function') return 'ƒ'
  if (chunkType === 'class') return '◆'
  if (chunkType === 'method') return '◇'
  return '·'
}
