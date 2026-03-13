/**
 * AutocompleteDropdown
 * Descrição: Dropdown com suporte a menu e submenu para autocomplete do input de chat.
 * Modos disponíveis:
 *  - command       -> lista de slash commands com descrição e badge para submenus
 *  - skills-browser -> submenu de skills com nome, descrição e badge "ativar"
 *  - skill         -> autocomplete inline de /use-skill
 *  - file          -> autocomplete inline de @arquivo
 */

import type { AutocompleteItem, AutocompleteMode } from '../hooks/useInputAutocomplete.js'

/**
 * AutocompleteDropdownProps
 * Descrição: Props do componente AutocompleteDropdown.
 */
interface AutocompleteDropdownProps {
  /** Lista de itens a exibir no dropdown */
  items: AutocompleteItem[]
  /** Índice do item atualmente selecionado */
  selectedIndex: number
  /** Modo atual do autocomplete (command, skill, file, etc.) */
  mode: AutocompleteMode
  /** Callback chamado quando um item é selecionado */
  onSelect: (item: AutocompleteItem) => void
}

/** HEADERS - Títulos dos headers para cada modo de autocomplete */
const HEADERS: Record<string, string> = {
  command: 'Comandos',
  'skills-browser': '● Skills instaladas',
  skill: 'Skills',
  file: 'Arquivos',
}

/**
 * AutocompleteDropdown
 * Descrição: Renderiza o dropdown de autocomplete com items, navegação por teclado e suporte a submenus.
 * @param items - Itens do autocomplete
 * @param selectedIndex - Índice selecionado
 * @param mode - Modo atual
 * @param onSelect - Callback de seleção
 * @returns Elemento JSX do dropdown ou null se não aplicável
 */
export function AutocompleteDropdown({
  items,
  selectedIndex,
  mode,
  onSelect,
}: AutocompleteDropdownProps) {
  if (!mode) return null

  const header = HEADERS[mode] ?? 'Sugestões'
  const isSubmenu = mode === 'skills-browser'

  if (items.length === 0) {
    // Mostra placeholder enquanto carrega o submenu
    if (isSubmenu) {
      return (
        <div className="autocomplete-dropdown autocomplete-dropdown--submenu" role="listbox">
          <div className="autocomplete-header">
            <span className="autocomplete-header__back">←</span>
            {header}
          </div>
          <div className="autocomplete-empty">Carregando skills...</div>
        </div>
      )
    }
    return null
  }

  return (
    <div
      className={`autocomplete-dropdown${isSubmenu ? ' autocomplete-dropdown--submenu' : ''}`}
      role="listbox"
      aria-label={header}
    >
      <div className="autocomplete-header">
        {isSubmenu && <span className="autocomplete-header__back">←</span>}
        {header}
        {isSubmenu && (
          <span className="autocomplete-header__hint">↑↓ navegar · Enter ativar · Esc voltar</span>
        )}
      </div>

      {items.map((item, i) => (
        <button
          key={item.label}
          role="option"
          aria-selected={i === selectedIndex}
          className={[
            'autocomplete-item',
            i === selectedIndex ? 'autocomplete-item--selected' : '',
            isSubmenu ? 'autocomplete-item--skill' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect(item)
          }}
        >
          <span className="autocomplete-item__label">{item.label}</span>
          {item.badge && <span className="autocomplete-item__badge">{item.badge}</span>}
          {item.description && (
            <span className="autocomplete-item__description">{item.description}</span>
          )}
        </button>
      ))}
    </div>
  )
}
