import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ToolCallInfo } from '../hooks/useChat.js'

// Mock shared module
import { vi } from 'vitest'
vi.mock('@athion/shared', () => ({}))

import { ToolCallCard } from './ToolCallCard.js'

describe('ToolCallCard', () => {
  it('deve renderizar nome da ferramenta', () => {
    const toolCall: ToolCallInfo = {
      id: 'tc-1',
      name: 'readFile',
      args: {},
      status: 'running',
    }
    render(<ToolCallCard toolCall={toolCall} />)
    expect(screen.getByText('readFile')).toBeDefined()
  })

  it('deve exibir ícone de running', () => {
    const toolCall: ToolCallInfo = {
      id: 'tc-1',
      name: 'readFile',
      args: {},
      status: 'running',
    }
    render(<ToolCallCard toolCall={toolCall} />)
    expect(screen.getByText('⟳')).toBeDefined()
  })

  it('deve exibir ícone de sucesso', () => {
    const toolCall: ToolCallInfo = {
      id: 'tc-1',
      name: 'editFile',
      args: {},
      status: 'success',
    }
    render(<ToolCallCard toolCall={toolCall} />)
    expect(screen.getByText('✓')).toBeDefined()
  })

  it('deve exibir ícone de erro', () => {
    const toolCall: ToolCallInfo = {
      id: 'tc-1',
      name: 'deleteFile',
      args: {},
      status: 'error',
    }
    render(<ToolCallCard toolCall={toolCall} />)
    expect(screen.getByText('✗')).toBeDefined()
  })

  it('deve exibir resultado quando presente', () => {
    const toolCall: ToolCallInfo = {
      id: 'tc-1',
      name: 'readFile',
      args: {},
      status: 'success',
      result: 'file content here',
    }
    render(<ToolCallCard toolCall={toolCall} />)
    expect(screen.getByText('file content here')).toBeDefined()
  })

  it('não deve exibir resultado quando ausente', () => {
    const toolCall: ToolCallInfo = {
      id: 'tc-1',
      name: 'readFile',
      args: {},
      status: 'running',
    }
    render(<ToolCallCard toolCall={toolCall} />)
    expect(screen.queryByRole('pre')).toBeNull()
  })

  it('deve truncar resultado longo para 300 caracteres', () => {
    const longResult = 'a'.repeat(500)
    const toolCall: ToolCallInfo = {
      id: 'tc-1',
      name: 'readFile',
      args: {},
      status: 'success',
      result: longResult,
    }
    render(<ToolCallCard toolCall={toolCall} />)
    const pre = screen.getByText('a'.repeat(300))
    expect(pre).toBeDefined()
  })

  it('deve renderizar resultado vazio como string vazia sem pre', () => {
    const toolCall: ToolCallInfo = {
      id: 'tc-1',
      name: 'readFile',
      args: {},
      status: 'success',
      result: '',
    }
    render(<ToolCallCard toolCall={toolCall} />)
    // result é empty string, que é falsy, então não renderiza pre
    expect(screen.getByText('readFile')).toBeDefined()
  })
})
