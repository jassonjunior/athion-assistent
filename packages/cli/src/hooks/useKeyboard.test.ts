/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Testes unitários para hooks/useKeyboard.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock do ink ───────────────────────────────────────────────────

let capturedHandler:
  | ((input: string, key: { ctrl: boolean; escape: boolean; meta: boolean }) => void)
  | null = null

vi.mock('ink', () => ({
  useInput: (handler: typeof capturedHandler) => {
    capturedHandler = handler
  },
}))

import { useKeyboard } from './useKeyboard.js'

describe('useKeyboard', () => {
  beforeEach(() => {
    capturedHandler = null
    vi.clearAllMocks()
  })

  it('registra handler de input via useInput', () => {
    useKeyboard()
    expect(capturedHandler).not.toBeNull()
  })

  it('Ctrl+L chama onClear', () => {
    const onClear = vi.fn()
    useKeyboard({ onClear })

    capturedHandler!('l', { ctrl: true, escape: false, meta: false })
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+L sem onClear não lança erro', () => {
    useKeyboard({})
    expect(() => {
      capturedHandler!('l', { ctrl: true, escape: false, meta: false })
    }).not.toThrow()
  })

  it('Esc chama onAbort', () => {
    const onAbort = vi.fn()
    useKeyboard({ onAbort })

    capturedHandler!('', { ctrl: false, escape: true, meta: false })
    expect(onAbort).toHaveBeenCalledTimes(1)
  })

  it('Esc sem onAbort não lança erro', () => {
    useKeyboard({})
    expect(() => {
      capturedHandler!('', { ctrl: false, escape: true, meta: false })
    }).not.toThrow()
  })

  it('tecla normal não dispara callbacks', () => {
    const onClear = vi.fn()
    const onAbort = vi.fn()
    useKeyboard({ onClear, onAbort })

    capturedHandler!('a', { ctrl: false, escape: false, meta: false })
    expect(onClear).not.toHaveBeenCalled()
    expect(onAbort).not.toHaveBeenCalled()
  })

  it('Ctrl+outra tecla não dispara onClear', () => {
    const onClear = vi.fn()
    useKeyboard({ onClear })

    capturedHandler!('c', { ctrl: true, escape: false, meta: false })
    expect(onClear).not.toHaveBeenCalled()
  })

  it('opções vazio funciona sem erro', () => {
    expect(() => useKeyboard({})).not.toThrow()
  })

  it('sem opções funciona sem erro', () => {
    expect(() => useKeyboard()).not.toThrow()
  })
})
