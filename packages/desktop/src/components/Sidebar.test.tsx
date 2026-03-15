import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const mockSessionList = vi.fn()

vi.mock('../bridge/tauri-bridge.js', () => ({
  sessionList: (...args: unknown[]) => mockSessionList(...args),
}))

vi.mock('../bridge/types.js', () => ({}))
vi.mock('@athion/shared', () => ({}))

import { Sidebar } from './Sidebar.js'

beforeEach(() => {
  vi.clearAllMocks()
  mockSessionList.mockResolvedValue([
    { id: 's1', title: 'Sessão 1', createdAt: '2024-01-01T00:00:00Z' },
    { id: 's2', title: 'Sessão 2', createdAt: '2024-01-02T00:00:00Z' },
    { id: 's3', title: '', createdAt: '2024-01-03T00:00:00Z' },
  ])
})

describe('Sidebar', () => {
  const defaultProps = {
    currentSessionId: 's1',
    onSelectSession: vi.fn(),
    onNewSession: vi.fn(),
    isCollapsed: false,
    onToggle: vi.fn(),
  }

  it('deve renderizar botão de expandir quando colapsada', () => {
    render(<Sidebar {...defaultProps} isCollapsed={true} />)
    const button = screen.getByTitle('Expandir')
    expect(button).toBeDefined()
  })

  it('deve chamar onToggle ao clicar em expandir', () => {
    const onToggle = vi.fn()
    render(<Sidebar {...defaultProps} isCollapsed={true} onToggle={onToggle} />)
    fireEvent.click(screen.getByTitle('Expandir'))
    expect(onToggle).toHaveBeenCalled()
  })

  it('deve renderizar header com título e botões quando expandida', async () => {
    await act(async () => {
      render(<Sidebar {...defaultProps} />)
    })

    expect(screen.getByText('Sessões')).toBeDefined()
    expect(screen.getByTitle('Nova sessão')).toBeDefined()
    expect(screen.getByTitle('Recolher')).toBeDefined()
  })

  it('deve carregar e exibir sessões', async () => {
    await act(async () => {
      render(<Sidebar {...defaultProps} />)
    })

    // Esperar carregamento
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(mockSessionList).toHaveBeenCalled()
    expect(screen.getByText('Sessão 1')).toBeDefined()
    expect(screen.getByText('Sessão 2')).toBeDefined()
  })

  it('deve exibir "Sem título" para sessões sem título', async () => {
    await act(async () => {
      render(<Sidebar {...defaultProps} />)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(screen.getByText('Sem título')).toBeDefined()
  })

  it('deve chamar onSelectSession ao clicar em uma sessão', async () => {
    const onSelectSession = vi.fn()
    await act(async () => {
      render(<Sidebar {...defaultProps} onSelectSession={onSelectSession} />)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    fireEvent.click(screen.getByText('Sessão 2'))
    expect(onSelectSession).toHaveBeenCalledWith('s2')
  })

  it('deve chamar onNewSession ao clicar no botão +', async () => {
    const onNewSession = vi.fn()
    await act(async () => {
      render(<Sidebar {...defaultProps} onNewSession={onNewSession} />)
    })

    fireEvent.click(screen.getByTitle('Nova sessão'))
    expect(onNewSession).toHaveBeenCalled()
  })

  it('deve chamar onToggle ao clicar em recolher', async () => {
    const onToggle = vi.fn()
    await act(async () => {
      render(<Sidebar {...defaultProps} onToggle={onToggle} />)
    })

    fireEvent.click(screen.getByTitle('Recolher'))
    expect(onToggle).toHaveBeenCalled()
  })

  it('deve lidar com erro ao carregar sessões silenciosamente', async () => {
    mockSessionList.mockRejectedValue(new Error('network error'))

    await act(async () => {
      render(<Sidebar {...defaultProps} />)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    // Não deve ter sessões, mas não deve quebrar
    expect(screen.getByText('Sessões')).toBeDefined()
  })

  it('deve recarregar sessões quando currentSessionId muda', async () => {
    const { rerender } = render(<Sidebar {...defaultProps} currentSessionId="s1" />)

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    const firstCallCount = mockSessionList.mock.calls.length

    await act(async () => {
      rerender(<Sidebar {...defaultProps} currentSessionId="s2" />)
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })

    expect(mockSessionList.mock.calls.length).toBeGreaterThan(firstCallCount)
  })
})
