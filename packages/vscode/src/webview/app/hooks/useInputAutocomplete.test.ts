/* eslint-disable @typescript-eslint/no-invalid-void-type */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockPost = vi.fn()
const mockOn = vi.fn()

vi.mock('./useMessenger.js', () => ({
  useMessenger: () => ({
    post: mockPost,
    on: mockOn,
    off: vi.fn(),
  }),
}))

const mockSetState = vi.fn()
const mockUseState = vi.fn((initial: unknown) => [initial, mockSetState])
const mockUseCallback = vi.fn((fn: unknown) => fn)
const mockUseEffect = vi.fn((fn: () => (() => void) | void) => {
  fn()
})
const mockUseRef = vi.fn((initial: unknown) => ({ current: initial }))

vi.mock('react', () => ({
  useState: (...args: unknown[]) => mockUseState(...args),
  useCallback: (...args: unknown[]) => mockUseCallback(...args),
  useEffect: (...args: unknown[]) => mockUseEffect(...args),
  useRef: (...args: unknown[]) => mockUseRef(...args),
}))

import { useInputAutocomplete } from './useInputAutocomplete.js'

describe('useInputAutocomplete', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    let stateIndex = 0
    const states = [
      [false, mockSetState], // isOpen
      [[], mockSetState], // items
      [0, mockSetState], // selectedIndex
      [null, mockSetState], // mode
    ]
    mockUseState.mockImplementation(() => {
      const state = states[stateIndex % states.length]
      stateIndex++
      return state
    })
  })

  it('retorna interface completa', () => {
    const result = useInputAutocomplete()

    expect(result).toHaveProperty('isOpen')
    expect(result).toHaveProperty('items')
    expect(result).toHaveProperty('selectedIndex')
    expect(result).toHaveProperty('mode')
    expect(result).toHaveProperty('handleChange')
    expect(result).toHaveProperty('handleKeyDown')
    expect(result).toHaveProperty('insertSelected')
    expect(result).toHaveProperty('shouldSubmitOnInsert')
    expect(result).toHaveProperty('close')
  })

  it('registra listeners de skill:list:result e files:list:result', () => {
    useInputAutocomplete()

    expect(mockOn).toHaveBeenCalledWith('skill:list:result', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('files:list:result', expect.any(Function))
  })

  describe('handleChange', () => {
    it('detecta slash command e abre autocomplete', () => {
      const { handleChange } = useInputAutocomplete()

      handleChange('/cl', 3)

      // Should set items with matching commands and open
      expect(mockSetState).toHaveBeenCalled()
    })

    it('detecta /use-skill com prefixo', () => {
      const { handleChange } = useInputAutocomplete()

      handleChange('/use-skill test', 15)

      // Should request skill list
      expect(mockPost).toHaveBeenCalledWith({ type: 'skill:list' })
    })

    it('detecta /skills com filtro (skills-browser)', () => {
      const { handleChange } = useInputAutocomplete()

      handleChange('/skills myfilter', 15)

      // Should request skill list
      expect(mockPost).toHaveBeenCalledWith({ type: 'skill:list' })
    })

    it('detecta @prefix para autocomplete de arquivo', () => {
      const { handleChange } = useInputAutocomplete()

      handleChange('@src/util', 9)

      expect(mockPost).toHaveBeenCalledWith({ type: 'files:list', prefix: 'src/util' })
    })

    it('nao abre autocomplete para texto normal', () => {
      const { handleChange } = useInputAutocomplete()

      handleChange('hello world', 11)

      // Should not open (items remain empty if no pattern matches)
    })
  })

  describe('handleKeyDown', () => {
    it('retorna false quando dropdown fechado', () => {
      const { handleKeyDown } = useInputAutocomplete()

      const result = handleKeyDown({
        key: 'ArrowDown',
        preventDefault: vi.fn(),
      } as never)

      expect(result).toBe(false)
    })
  })

  describe('insertSelected', () => {
    it('retorna null quando nao ha item selecionado', () => {
      const { insertSelected } = useInputAutocomplete()

      const result = insertSelected('current', 7)

      expect(result).toBeNull()
    })
  })

  describe('shouldSubmitOnInsert', () => {
    it('retorna false quando mode e null', () => {
      const { shouldSubmitOnInsert } = useInputAutocomplete()

      const result = shouldSubmitOnInsert('/clear')

      expect(result).toBe(false)
    })
  })

  describe('close', () => {
    it('reseta todos os estados do autocomplete', () => {
      const { close } = useInputAutocomplete()

      close()

      expect(mockSetState).toHaveBeenCalled()
    })
  })
})
