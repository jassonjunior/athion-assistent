import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('@athion/shared', () => ({}))

import { useTheme } from './useTheme.js'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove('dark')
})

describe('useTheme', () => {
  it('deve usar tema do localStorage se disponível', () => {
    localStorage.setItem('athion-theme', 'light')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
  })

  it('deve usar dark como padrão quando sistema prefere dark', () => {
    // jsdom default matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: true }),
    })

    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
  })

  it('deve usar light quando sistema prefere light e sem localStorage', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({ matches: false }),
    })

    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
  })

  it('deve alternar de dark para light com toggle', () => {
    localStorage.setItem('athion-theme', 'dark')
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.toggle()
    })

    expect(result.current.theme).toBe('light')
  })

  it('deve alternar de light para dark com toggle', () => {
    localStorage.setItem('athion-theme', 'light')
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.toggle()
    })

    expect(result.current.theme).toBe('dark')
  })

  it('deve persistir tema no localStorage ao mudar', () => {
    localStorage.setItem('athion-theme', 'dark')
    const { result } = renderHook(() => useTheme())

    act(() => {
      result.current.toggle()
    })

    expect(localStorage.getItem('athion-theme')).toBe('light')
  })

  it('deve adicionar classe dark ao documentElement quando dark', () => {
    localStorage.setItem('athion-theme', 'dark')
    renderHook(() => useTheme())

    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('deve remover classe dark ao mudar para light', () => {
    localStorage.setItem('athion-theme', 'dark')
    const { result } = renderHook(() => useTheme())

    expect(document.documentElement.classList.contains('dark')).toBe(true)

    act(() => {
      result.current.toggle()
    })

    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('deve alternar múltiplas vezes corretamente', () => {
    localStorage.setItem('athion-theme', 'dark')
    const { result } = renderHook(() => useTheme())

    act(() => result.current.toggle()) // -> light
    act(() => result.current.toggle()) // -> dark
    act(() => result.current.toggle()) // -> light

    expect(result.current.theme).toBe('light')
    expect(localStorage.getItem('athion-theme')).toBe('light')
  })
})
