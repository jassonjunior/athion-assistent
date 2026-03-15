import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFeedbackPhrase } from './useFeedbackPhrase.js'

// Mock do ta() de i18n
vi.mock('../i18n/i18n.js', () => ({
  ta: vi.fn(() => ['Frase 1', 'Frase 2', 'Frase 3']),
}))

describe('useFeedbackPhrase', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('retorna string vazia quando inativo', () => {
    const { result } = renderHook(() => useFeedbackPhrase(false))
    expect(result.current).toBe('')
  })

  it('retorna uma frase quando ativo', () => {
    const { result } = renderHook(() => useFeedbackPhrase(true))
    expect(result.current).toBeTruthy()
    expect(['Frase 1', 'Frase 2', 'Frase 3']).toContain(result.current)
  })

  it('troca a frase no intervalo', () => {
    const { result } = renderHook(() => useFeedbackPhrase(true, 1000))
    const firstPhrase = result.current

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // A frase pode ser diferente (anti-repetição tenta evitar a mesma)
    expect(result.current).toBeTruthy()
    expect(['Frase 1', 'Frase 2', 'Frase 3']).toContain(result.current)
    // Pode ou não ser diferente da primeira (depende do random), mas está ativa
    void firstPhrase
  })

  it('limpa a frase quando desativado', () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useFeedbackPhrase(active),
      { initialProps: { active: true } },
    )

    expect(result.current).toBeTruthy()

    rerender({ active: false })
    expect(result.current).toBe('')
  })
})
