import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../bridge/types.js', () => ({}))
vi.mock('@athion/shared', () => ({}))

import { StatusBar } from './StatusBar.js'

describe('StatusBar', () => {
  it('deve exibir "Iniciando..." quando status é starting', () => {
    render(<StatusBar status="starting" />)
    expect(screen.getByText('Iniciando...')).toBeDefined()
  })

  it('deve exibir "Conectado" quando status é ready', () => {
    render(<StatusBar status="ready" />)
    expect(screen.getByText('Conectado')).toBeDefined()
  })

  it('deve exibir "Erro de conexão" quando status é error', () => {
    render(<StatusBar status="error" />)
    expect(screen.getByText('Erro de conexão')).toBeDefined()
  })

  it('deve exibir "Desconectado" quando status é stopped', () => {
    render(<StatusBar status="stopped" />)
    expect(screen.getByText('Desconectado')).toBeDefined()
  })

  it('deve renderizar indicador visual colorido para starting', () => {
    const { container } = render(<StatusBar status="starting" />)
    const indicator = container.querySelector('.bg-warning-500')
    expect(indicator).toBeDefined()
  })

  it('deve renderizar indicador visual colorido para ready', () => {
    const { container } = render(<StatusBar status="ready" />)
    const indicator = container.querySelector('.bg-success-500')
    expect(indicator).toBeDefined()
  })

  it('deve renderizar indicador visual colorido para error', () => {
    const { container } = render(<StatusBar status="error" />)
    const indicator = container.querySelector('.bg-error-500')
    expect(indicator).toBeDefined()
  })

  it('deve renderizar indicador visual colorido para stopped', () => {
    const { container } = render(<StatusBar status="stopped" />)
    const indicator = container.querySelector('.bg-neutral-500')
    expect(indicator).toBeDefined()
  })
})
