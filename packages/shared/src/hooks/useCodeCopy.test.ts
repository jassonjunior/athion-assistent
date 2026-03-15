import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCodeCopy } from './useCodeCopy.js'

describe('useCodeCopy', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(() => Promise.resolve()),
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('inicia com copied=false', () => {
    const { result } = renderHook(() => useCodeCopy())
    expect(result.current.copied).toBe(false)
  })

  it('seta copied=true após handleCopy', async () => {
    const { result } = renderHook(() => useCodeCopy())

    await act(async () => {
      result.current.handleCopy('const x = 1')
      // Flush promise
      await Promise.resolve()
    })

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const x = 1')
    expect(result.current.copied).toBe(true)
  })

  it('reseta copied=false após 2s', async () => {
    const { result } = renderHook(() => useCodeCopy())

    await act(async () => {
      result.current.handleCopy('code')
      await Promise.resolve()
    })

    expect(result.current.copied).toBe(true)

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(result.current.copied).toBe(false)
  })
})
