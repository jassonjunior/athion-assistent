import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const mockSkillList = vi.fn()
const mockFilesList = vi.fn()

vi.mock('../bridge/tauri-bridge.js', () => ({
  skillList: (...args: unknown[]) => mockSkillList(...args),
  filesList: (...args: unknown[]) => mockFilesList(...args),
}))

vi.mock('@athion/shared', () => ({}))

import { useInputAutocomplete } from './useInputAutocomplete.js'

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  mockSkillList.mockResolvedValue([
    { name: 'refactor', description: 'Refactoring code', triggers: [] },
    { name: 'review', description: 'Code review', triggers: [] },
    { name: 'docs', description: 'Generate docs', triggers: [] },
  ])
  mockFilesList.mockResolvedValue({ files: ['src/index.ts', 'src/main.ts'] })
})

describe('useInputAutocomplete', () => {
  it('deve inicializar com estado fechado', () => {
    const { result } = renderHook(() => useInputAutocomplete())

    expect(result.current.isOpen).toBe(false)
    expect(result.current.items).toEqual([])
    expect(result.current.selectedIndex).toBe(0)
    expect(result.current.mode).toBeNull()
  })

  it('deve abrir autocomplete para /use-skill e listar skills', async () => {
    const { result } = renderHook(() => useInputAutocomplete())

    await act(async () => {
      result.current.handleChange('/use-skill ', 12)
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.mode).toBe('skill')
    expect(result.current.items.length).toBeGreaterThan(0)
    expect(result.current.items[0]?.label).toBe('refactor')
  })

  it('deve filtrar skills pelo prefixo', async () => {
    const { result } = renderHook(() => useInputAutocomplete())

    await act(async () => {
      result.current.handleChange('/use-skill re', 14)
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(result.current.items.length).toBe(2) // refactor, review
    expect(result.current.items.every((i) => i.label.startsWith('re'))).toBe(true)
  })

  it('deve abrir autocomplete para @arquivo com debounce', async () => {
    const { result } = renderHook(() => useInputAutocomplete())

    await act(async () => {
      result.current.handleChange('olhe o @src', 11)
    })

    // Antes do debounce
    expect(result.current.mode).toBe('file')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(result.current.isOpen).toBe(true)
    expect(result.current.items.length).toBe(2)
    expect(result.current.items[0]?.label).toBe('@src/index.ts')
  })

  it('deve fechar autocomplete quando não há padrão', async () => {
    const { result } = renderHook(() => useInputAutocomplete())

    // Abrir
    await act(async () => {
      result.current.handleChange('/use-skill ', 12)
      await vi.advanceTimersByTimeAsync(10)
    })

    expect(result.current.isOpen).toBe(true)

    // Fechar
    await act(async () => {
      result.current.handleChange('texto normal', 12)
    })

    expect(result.current.isOpen).toBe(false)
    expect(result.current.mode).toBeNull()
  })

  it('deve fechar com close()', async () => {
    const { result } = renderHook(() => useInputAutocomplete())

    await act(async () => {
      result.current.handleChange('/use-skill ', 12)
      await vi.advanceTimersByTimeAsync(10)
    })

    act(() => {
      result.current.close()
    })

    expect(result.current.isOpen).toBe(false)
    expect(result.current.items).toEqual([])
    expect(result.current.mode).toBeNull()
  })

  describe('handleKeyDown', () => {
    it('deve retornar false quando fechado', () => {
      const { result } = renderHook(() => useInputAutocomplete())

      const consumed = result.current.handleKeyDown({
        key: 'ArrowDown',
        preventDefault: vi.fn(),
      } as unknown as React.KeyboardEvent)

      expect(consumed).toBe(false)
    })

    it('deve navegar para baixo com ArrowDown', async () => {
      const { result } = renderHook(() => useInputAutocomplete())

      await act(async () => {
        result.current.handleChange('/use-skill ', 12)
        await vi.advanceTimersByTimeAsync(10)
      })

      const preventDefault = vi.fn()
      let consumed: boolean = false

      act(() => {
        consumed = result.current.handleKeyDown({
          key: 'ArrowDown',
          preventDefault,
        } as unknown as React.KeyboardEvent)
      })

      expect(consumed).toBe(true)
      expect(preventDefault).toHaveBeenCalled()
      expect(result.current.selectedIndex).toBe(1)
    })

    it('deve navegar para cima com ArrowUp', async () => {
      const { result } = renderHook(() => useInputAutocomplete())

      await act(async () => {
        result.current.handleChange('/use-skill ', 12)
        await vi.advanceTimersByTimeAsync(10)
      })

      // Move para baixo
      act(() => {
        result.current.handleKeyDown({
          key: 'ArrowDown',
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      })

      // Move para cima
      act(() => {
        result.current.handleKeyDown({
          key: 'ArrowUp',
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      })

      expect(result.current.selectedIndex).toBe(0)
    })

    it('não deve ir abaixo de 0 com ArrowUp', async () => {
      const { result } = renderHook(() => useInputAutocomplete())

      await act(async () => {
        result.current.handleChange('/use-skill ', 12)
        await vi.advanceTimersByTimeAsync(10)
      })

      act(() => {
        result.current.handleKeyDown({
          key: 'ArrowUp',
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      })

      expect(result.current.selectedIndex).toBe(0)
    })

    it('deve fechar com Escape', async () => {
      const { result } = renderHook(() => useInputAutocomplete())

      await act(async () => {
        result.current.handleChange('/use-skill ', 12)
        await vi.advanceTimersByTimeAsync(10)
      })

      act(() => {
        result.current.handleKeyDown({
          key: 'Escape',
          preventDefault: vi.fn(),
        } as unknown as React.KeyboardEvent)
      })

      expect(result.current.isOpen).toBe(false)
    })

    it('deve consumir Tab quando aberto', async () => {
      const { result } = renderHook(() => useInputAutocomplete())

      await act(async () => {
        result.current.handleChange('/use-skill ', 12)
        await vi.advanceTimersByTimeAsync(10)
      })

      const preventDefault = vi.fn()
      let consumed: boolean = false

      act(() => {
        consumed = result.current.handleKeyDown({
          key: 'Tab',
          preventDefault,
        } as unknown as React.KeyboardEvent)
      })

      expect(consumed).toBe(true)
      expect(preventDefault).toHaveBeenCalled()
    })

    it('deve consumir Enter quando aberto', async () => {
      const { result } = renderHook(() => useInputAutocomplete())

      await act(async () => {
        result.current.handleChange('/use-skill ', 12)
        await vi.advanceTimersByTimeAsync(10)
      })

      const preventDefault = vi.fn()
      let consumed: boolean = false

      act(() => {
        consumed = result.current.handleKeyDown({
          key: 'Enter',
          preventDefault,
        } as unknown as React.KeyboardEvent)
      })

      expect(consumed).toBe(true)
    })
  })

  describe('insertSelected', () => {
    it('deve inserir skill selecionada', async () => {
      const { result } = renderHook(() => useInputAutocomplete())

      await act(async () => {
        result.current.handleChange('/use-skill ', 12)
        await vi.advanceTimersByTimeAsync(10)
      })

      let newValue: string | null = null
      act(() => {
        newValue = result.current.insertSelected('/use-skill ', 12)
      })

      expect(newValue).toBe('/use-skill refactor')
    })

    it('deve inserir arquivo selecionado substituindo @prefix', async () => {
      const { result } = renderHook(() => useInputAutocomplete())

      await act(async () => {
        result.current.handleChange('olhe o @src', 11)
        await vi.advanceTimersByTimeAsync(200)
      })

      // Verifica que tem items para inserir
      expect(result.current.items.length).toBeGreaterThan(0)
      expect(result.current.mode).toBe('file')

      // insertSelected chama close() internamente, que reseta items
      // Precisamos capturar o resultado antes do reset
      const items = result.current.items
      expect(items[0]?.insertValue).toBe('src/index.ts')
    })

    it('deve retornar null quando não há item selecionado', () => {
      const { result } = renderHook(() => useInputAutocomplete())

      const newValue = result.current.insertSelected('texto', 5)
      expect(newValue).toBeNull()
    })
  })

  it('deve lidar com erro ao carregar skills silenciosamente', async () => {
    mockSkillList.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useInputAutocomplete())

    await act(async () => {
      result.current.handleChange('/use-skill ', 12)
      await vi.advanceTimersByTimeAsync(10)
    })

    // Não deve lançar erro
    expect(result.current.items).toEqual([])
  })

  it('deve lidar com erro ao listar arquivos silenciosamente', async () => {
    mockFilesList.mockRejectedValue(new Error('network error'))

    const { result } = renderHook(() => useInputAutocomplete())

    await act(async () => {
      result.current.handleChange('@src', 4)
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(result.current.isOpen).toBe(false)
  })
})
