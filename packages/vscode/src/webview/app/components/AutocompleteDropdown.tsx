/**
 * AutocompleteDropdown — Dropdown genérico para sugestões de autocomplete.
 *
 * Usado para skills (/use-skill) e arquivos (@mentions) no InputArea.
 */

import type { AutocompleteItem } from '../hooks/useInputAutocomplete.js'

interface AutocompleteDropdownProps {
  items: AutocompleteItem[]
  selectedIndex: number
  mode: 'skill' | 'file' | null
  onSelect: (item: AutocompleteItem) => void
}

export function AutocompleteDropdown({
  items,
  selectedIndex,
  mode,
  onSelect,
}: AutocompleteDropdownProps) {
  if (items.length === 0) return null

  const header = mode === 'skill' ? 'Skills disponíveis' : 'Arquivos'

  return (
    <div className="autocomplete-dropdown" role="listbox" aria-label={header}>
      <div className="autocomplete-header">{header}</div>
      {items.map((item, i) => (
        <button
          key={item.label}
          role="option"
          aria-selected={i === selectedIndex}
          className={`autocomplete-item${i === selectedIndex ? ' autocomplete-item--selected' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(item)
          }}
        >
          <span className="autocomplete-item__label">{item.label}</span>
          {item.description && (
            <span className="autocomplete-item__description">{item.description}</span>
          )}
        </button>
      ))}
    </div>
  )
}
