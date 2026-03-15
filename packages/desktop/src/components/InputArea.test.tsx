import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock autocomplete hook
const mockAutocomplete = {
  isOpen: false,
  items: [] as Array<{ label: string; description?: string; insertValue: string }>,
  selectedIndex: 0,
  mode: null as 'skill' | 'file' | null,
  handleChange: vi.fn(),
  handleKeyDown: vi.fn().mockReturnValue(false),
  insertSelected: vi.fn().mockReturnValue(null),
  close: vi.fn(),
}

vi.mock('../hooks/useInputAutocomplete.js', () => ({
  useInputAutocomplete: () => mockAutocomplete,
}))

vi.mock('@athion/shared', () => ({}))

import { InputArea } from './InputArea.js'

beforeEach(() => {
  vi.clearAllMocks()
  mockAutocomplete.isOpen = false
  mockAutocomplete.items = []
  mockAutocomplete.selectedIndex = 0
  mockAutocomplete.mode = null
  mockAutocomplete.handleKeyDown.mockReturnValue(false)
  mockAutocomplete.insertSelected.mockReturnValue(null)
})

describe('InputArea', () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    onAbort: vi.fn(),
    isStreaming: false,
    isDisabled: false,
  }

  it('deve renderizar textarea quando não está em streaming', () => {
    render(<InputArea {...defaultProps} />)
    const textarea = screen.getByPlaceholderText(/Digite sua mensagem/i)
    expect(textarea).toBeDefined()
  })

  it('deve renderizar botão de abort quando está em streaming', () => {
    render(<InputArea {...defaultProps} isStreaming={true} />)
    const button = screen.getByText('Parar geração')
    expect(button).toBeDefined()
  })

  it('deve chamar onAbort ao clicar no botão de abort', () => {
    const onAbort = vi.fn()
    render(<InputArea {...defaultProps} onAbort={onAbort} isStreaming={true} />)
    fireEvent.click(screen.getByText('Parar geração'))
    expect(onAbort).toHaveBeenCalled()
  })

  it('deve mostrar placeholder de conexão quando desabilitado', () => {
    render(<InputArea {...defaultProps} isDisabled={true} />)
    const textarea = screen.getByPlaceholderText('Conectando ao core...')
    expect(textarea).toBeDefined()
  })

  it('deve renderizar com valor inicial', () => {
    render(<InputArea {...defaultProps} initialValue="Hello" />)
    const textarea = screen.getByDisplayValue('Hello')
    expect(textarea).toBeDefined()
  })

  it('deve chamar onSubmit ao pressionar Enter', () => {
    const onSubmit = vi.fn()
    render(<InputArea {...defaultProps} onSubmit={onSubmit} />)
    const textarea = screen.getByPlaceholderText(/Digite sua mensagem/i)

    fireEvent.change(textarea, { target: { value: 'Olá mundo' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(onSubmit).toHaveBeenCalledWith('Olá mundo')
  })

  it('não deve chamar onSubmit com Enter + Shift', () => {
    const onSubmit = vi.fn()
    render(<InputArea {...defaultProps} onSubmit={onSubmit} />)
    const textarea = screen.getByPlaceholderText(/Digite sua mensagem/i)

    fireEvent.change(textarea, { target: { value: 'Olá' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('não deve chamar onSubmit com texto vazio', () => {
    const onSubmit = vi.fn()
    render(<InputArea {...defaultProps} onSubmit={onSubmit} />)
    const textarea = screen.getByPlaceholderText(/Digite sua mensagem/i)

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('não deve enviar quando está em streaming', () => {
    const onSubmit = vi.fn()
    render(<InputArea {...defaultProps} onSubmit={onSubmit} isStreaming={true} />)
    // Em streaming, o textarea não é renderizado, então não tem como enviar
    expect(screen.queryByPlaceholderText(/Digite sua mensagem/i)).toBeNull()
  })

  it('não deve enviar quando está desabilitado', () => {
    const onSubmit = vi.fn()
    render(<InputArea {...defaultProps} onSubmit={onSubmit} isDisabled={true} />)
    const textarea = screen.getByPlaceholderText('Conectando ao core...')

    fireEvent.change(textarea, { target: { value: 'test' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('deve chamar handleChange do autocomplete ao digitar', () => {
    render(<InputArea {...defaultProps} />)
    const textarea = screen.getByPlaceholderText(/Digite sua mensagem/i)

    fireEvent.change(textarea, { target: { value: '/use-skill ', selectionStart: 12 } })

    expect(mockAutocomplete.handleChange).toHaveBeenCalled()
  })

  it('deve renderizar dropdown de autocomplete quando aberto', () => {
    mockAutocomplete.isOpen = true
    mockAutocomplete.mode = 'skill'
    mockAutocomplete.items = [
      { label: 'refactor', description: 'Refactoring', insertValue: '/use-skill refactor' },
    ]

    render(<InputArea {...defaultProps} />)

    expect(screen.getByText('Skills disponíveis')).toBeDefined()
    expect(screen.getByText('refactor')).toBeDefined()
    expect(screen.getByText('Refactoring')).toBeDefined()
  })

  it('deve renderizar header de Arquivos no modo file', () => {
    mockAutocomplete.isOpen = true
    mockAutocomplete.mode = 'file'
    mockAutocomplete.items = [{ label: '@src/index.ts', insertValue: 'src/index.ts' }]

    render(<InputArea {...defaultProps} />)

    expect(screen.getByText('Arquivos')).toBeDefined()
  })

  it('deve delegar keydown ao autocomplete primeiro', () => {
    mockAutocomplete.handleKeyDown.mockReturnValue(true)

    render(<InputArea {...defaultProps} />)
    const textarea = screen.getByPlaceholderText(/Digite sua mensagem/i)

    fireEvent.change(textarea, { target: { value: 'test' } })
    fireEvent.keyDown(textarea, { key: 'ArrowDown' })

    expect(mockAutocomplete.handleKeyDown).toHaveBeenCalled()
  })

  it('deve limpar valor após submit', () => {
    const onSubmit = vi.fn()
    render(<InputArea {...defaultProps} onSubmit={onSubmit} />)
    const textarea = screen.getByPlaceholderText(/Digite sua mensagem/i) as HTMLTextAreaElement

    fireEvent.change(textarea, { target: { value: 'Olá' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(textarea.value).toBe('')
  })
})
