import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const mockOnDeepLinkSession = vi.fn()
const mockOnDeepLinkMessage = vi.fn()
const mockOnDeepLinkNew = vi.fn()
const mockOnDeepLinkConfig = vi.fn()

vi.mock('../bridge/tauri-bridge.js', () => ({
  onDeepLinkSession: (...args: unknown[]) => mockOnDeepLinkSession(...args),
  onDeepLinkMessage: (...args: unknown[]) => mockOnDeepLinkMessage(...args),
  onDeepLinkNew: (...args: unknown[]) => mockOnDeepLinkNew(...args),
  onDeepLinkConfig: (...args: unknown[]) => mockOnDeepLinkConfig(...args),
}))

vi.mock('@athion/shared', () => ({}))

import { useDeepLink } from './useDeepLink.js'

beforeEach(() => {
  vi.clearAllMocks()
  mockOnDeepLinkSession.mockResolvedValue(vi.fn())
  mockOnDeepLinkMessage.mockResolvedValue(vi.fn())
  mockOnDeepLinkNew.mockResolvedValue(vi.fn())
  mockOnDeepLinkConfig.mockResolvedValue(vi.fn())
})

describe('useDeepLink', () => {
  it('deve registrar listener de sessão quando onSession é fornecido', () => {
    const onSession = vi.fn()
    renderHook(() => useDeepLink({ onSession }))

    expect(mockOnDeepLinkSession).toHaveBeenCalledWith(onSession)
  })

  it('deve registrar listener de mensagem quando onMessage é fornecido', () => {
    const onMessage = vi.fn()
    renderHook(() => useDeepLink({ onMessage }))

    expect(mockOnDeepLinkMessage).toHaveBeenCalledWith(onMessage)
  })

  it('deve registrar listener de novo chat quando onNew é fornecido', () => {
    const onNew = vi.fn()
    renderHook(() => useDeepLink({ onNew }))

    expect(mockOnDeepLinkNew).toHaveBeenCalledWith(onNew)
  })

  it('deve registrar listener de config quando onConfig é fornecido', () => {
    const onConfig = vi.fn()
    renderHook(() => useDeepLink({ onConfig }))

    expect(mockOnDeepLinkConfig).toHaveBeenCalledWith(onConfig)
  })

  it('não deve registrar listeners para callbacks não fornecidos', () => {
    renderHook(() => useDeepLink({}))

    expect(mockOnDeepLinkSession).not.toHaveBeenCalled()
    expect(mockOnDeepLinkMessage).not.toHaveBeenCalled()
    expect(mockOnDeepLinkNew).not.toHaveBeenCalled()
    expect(mockOnDeepLinkConfig).not.toHaveBeenCalled()
  })

  it('deve registrar todos os listeners quando todos os callbacks são fornecidos', () => {
    const callbacks = {
      onSession: vi.fn(),
      onMessage: vi.fn(),
      onNew: vi.fn(),
      onConfig: vi.fn(),
    }

    renderHook(() => useDeepLink(callbacks))

    expect(mockOnDeepLinkSession).toHaveBeenCalledWith(callbacks.onSession)
    expect(mockOnDeepLinkMessage).toHaveBeenCalledWith(callbacks.onMessage)
    expect(mockOnDeepLinkNew).toHaveBeenCalledWith(callbacks.onNew)
    expect(mockOnDeepLinkConfig).toHaveBeenCalledWith(callbacks.onConfig)
  })

  it('deve chamar unlisten ao desmontar', async () => {
    const unlistenSession = vi.fn()
    const unlistenMessage = vi.fn()
    mockOnDeepLinkSession.mockResolvedValue(unlistenSession)
    mockOnDeepLinkMessage.mockResolvedValue(unlistenMessage)

    const { unmount } = renderHook(() => useDeepLink({ onSession: vi.fn(), onMessage: vi.fn() }))

    unmount()

    // Aguardar promises resolverem
    await new Promise((r) => setTimeout(r, 10))

    expect(unlistenSession).toHaveBeenCalled()
    expect(unlistenMessage).toHaveBeenCalled()
  })

  it('deve re-registrar listeners quando callbacks mudam', () => {
    const onSession1 = vi.fn()
    const onSession2 = vi.fn()

    const { rerender } = renderHook(({ onSession }) => useDeepLink({ onSession }), {
      initialProps: { onSession: onSession1 },
    })

    expect(mockOnDeepLinkSession).toHaveBeenCalledWith(onSession1)

    rerender({ onSession: onSession2 })

    expect(mockOnDeepLinkSession).toHaveBeenCalledWith(onSession2)
  })
})
