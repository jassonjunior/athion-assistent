/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDesktopNotification } from './useDesktopNotification'
import type { WsServerMessage } from '../../server/protocol'

// Mock the platform utility
vi.mock('../utils/platform', () => ({
  isTauri: vi.fn(() => false),
}))

import { isTauri } from '../utils/platform'

describe('useDesktopNotification', () => {
  let originalHidden: boolean
  let mockNotification: ReturnType<typeof vi.fn>

  beforeEach(() => {
    originalHidden = document.hidden
    mockNotification = vi.fn()

    // Mock document.hidden
    Object.defineProperty(document, 'hidden', {
      writable: true,
      value: true,
    })

    // Mock Notification API
    vi.stubGlobal('Notification', mockNotification)
    Object.defineProperty(mockNotification, 'permission', {
      writable: true,
      value: 'granted',
    })

    vi.mocked(isTauri).mockReturnValue(false)
  })

  afterEach(() => {
    Object.defineProperty(document, 'hidden', {
      writable: true,
      value: originalHidden,
    })
    vi.restoreAllMocks()
  })

  it('should not notify when document is visible', () => {
    Object.defineProperty(document, 'hidden', { value: false })

    const messages: WsServerMessage[] = [
      { type: 'test:finished', testName: 'test1', passed: true, duration: 1000, ts: Date.now() },
    ]
    renderHook(() => useDesktopNotification(messages))

    expect(mockNotification).not.toHaveBeenCalled()
  })

  it('should send web notification for test:finished when hidden', () => {
    const messages: WsServerMessage[] = [
      { type: 'test:finished', testName: 'test1', passed: true, duration: 2500, ts: Date.now() },
    ]
    renderHook(() => useDesktopNotification(messages))

    expect(mockNotification).toHaveBeenCalledTimes(1)
    expect(mockNotification).toHaveBeenCalledWith(
      'Teste passou',
      expect.objectContaining({
        body: expect.stringContaining('test1'),
      }),
    )
  })

  it('should show failure title when test fails', () => {
    const messages: WsServerMessage[] = [
      { type: 'test:finished', testName: 'test1', passed: false, duration: 500, ts: Date.now() },
    ]
    renderHook(() => useDesktopNotification(messages))

    expect(mockNotification).toHaveBeenCalledWith('Teste falhou', expect.any(Object))
  })

  it('should include duration in notification body', () => {
    const messages: WsServerMessage[] = [
      { type: 'test:finished', testName: 'test1', passed: true, duration: 3500, ts: Date.now() },
    ]
    renderHook(() => useDesktopNotification(messages))

    expect(mockNotification).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: expect.stringContaining('3.5s') }),
    )
  })

  it('should not notify for non test:finished messages', () => {
    const messages: WsServerMessage[] = [
      { type: 'test:started', testName: 'test1', ts: Date.now() },
    ]
    renderHook(() => useDesktopNotification(messages))

    expect(mockNotification).not.toHaveBeenCalled()
  })

  it('should not notify when Notification permission is not granted', () => {
    Object.defineProperty(mockNotification, 'permission', { value: 'denied' })

    const messages: WsServerMessage[] = [
      { type: 'test:finished', testName: 'test1', passed: true, duration: 1000, ts: Date.now() },
    ]
    renderHook(() => useDesktopNotification(messages))

    expect(mockNotification).not.toHaveBeenCalled()
  })

  it('should use Tauri notification when in Tauri environment', () => {
    vi.mocked(isTauri).mockReturnValue(true)

    const mockInvoke = vi.fn().mockResolvedValue(undefined)

    ;(window as any).__TAURI_INTERNALS__ = { invoke: mockInvoke }

    const messages: WsServerMessage[] = [
      { type: 'test:finished', testName: 'test1', passed: true, duration: 1000, ts: Date.now() },
    ]
    renderHook(() => useDesktopNotification(messages))

    expect(mockInvoke).toHaveBeenCalledWith(
      'plugin:notification|notify',
      expect.objectContaining({
        title: 'Teste passou',
        body: expect.stringContaining('test1'),
      }),
    )

    // Should NOT use web Notification
    expect(mockNotification).not.toHaveBeenCalled()

    delete (window as any).__TAURI_INTERNALS__
  })

  it('should only notify for new messages (not previously seen)', () => {
    const msg1: WsServerMessage = {
      type: 'test:finished',
      testName: 'test1',
      passed: true,
      duration: 1000,
      ts: Date.now(),
    }
    const msg2: WsServerMessage = {
      type: 'test:finished',
      testName: 'test2',
      passed: false,
      duration: 2000,
      ts: Date.now(),
    }

    const { rerender } = renderHook(({ msgs }) => useDesktopNotification(msgs), {
      initialProps: { msgs: [msg1] as WsServerMessage[] },
    })

    expect(mockNotification).toHaveBeenCalledTimes(1)

    // Re-render with same + new message
    rerender({ msgs: [msg1, msg2] })

    // Should only have notified for the new one (msg2)
    expect(mockNotification).toHaveBeenCalledTimes(2)
  })
})
