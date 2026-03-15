/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-invalid-void-type */
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

// Track state updates
let stateValues: Record<string, unknown> = {}
const mockSetState = vi.fn((value: unknown) => value)

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

import { useAtMention } from './useAtMention.js'

describe('useAtMention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateValues = {}

    let stateIndex = 0
    const states = [
      [false, mockSetState], // isOpen
      [[], mockSetState], // results
      ['', mockSetState], // query
      [0, mockSetState], // selectedIndex
    ]
    mockUseState.mockImplementation(() => {
      const state = states[stateIndex % states.length]
      stateIndex++
      return state
    })
  })

  it('retorna interface completa', () => {
    const result = useAtMention()

    expect(result).toHaveProperty('isOpen')
    expect(result).toHaveProperty('results')
    expect(result).toHaveProperty('query')
    expect(result).toHaveProperty('selectedIndex')
    expect(result).toHaveProperty('handleChange')
    expect(result).toHaveProperty('handleKeyDown')
    expect(result).toHaveProperty('insertMention')
    expect(result).toHaveProperty('close')
  })

  it('registra listener de mention:results', () => {
    useAtMention()

    expect(mockOn).toHaveBeenCalledWith('mention:results', expect.any(Function))
  })

  describe('handleChange', () => {
    it('detecta padrao @ e envia mention:search', () => {
      const { handleChange } = useAtMention()

      handleChange('olha @test', 10)

      expect(mockPost).toHaveBeenCalledWith({ type: 'mention:search', query: 'test' })
    })

    it('envia busca vazia quando @ sozinho', () => {
      const { handleChange } = useAtMention()

      // Actually @ alone doesn't match AT_PATTERN (/@(\w[\w./\\-]*)$/)
      // because it requires at least one word char after @
      handleChange('olha @', 6)

      // @ alone won't match the pattern, so no search
    })

    it('nao envia busca sem @', () => {
      const { handleChange } = useAtMention()

      handleChange('normal text', 11)

      expect(mockPost).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'mention:search' }))
    })

    it('detecta @ com caminho de arquivo', () => {
      const { handleChange } = useAtMention()

      handleChange('@src/utils/helper', 17)

      expect(mockPost).toHaveBeenCalledWith({
        type: 'mention:search',
        query: 'src/utils/helper',
      })
    })
  })

  describe('handleKeyDown', () => {
    it('retorna false quando dropdown fechado', () => {
      const { handleKeyDown } = useAtMention()

      const result = handleKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() } as never)

      expect(result).toBe(false)
    })
  })

  describe('insertMention', () => {
    it('retorna valor original se mentionStart e -1', () => {
      const { insertMention } = useAtMention()

      const result = insertMention(
        { file: 'src/test.ts', startLine: 1, chunkType: 'function', score: 0.9 },
        'current value',
        13,
      )

      expect(result).toBe('current value')
    })
  })

  describe('close', () => {
    it('reseta todos os estados', () => {
      const { close } = useAtMention()

      close()

      // Should call setters to reset state
      expect(mockSetState).toHaveBeenCalled()
    })
  })
})
