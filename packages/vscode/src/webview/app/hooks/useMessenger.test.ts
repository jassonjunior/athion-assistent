/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-invalid-void-type */
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock acquireVsCodeApi
const mockPostMessage = vi.fn()
const mockGetState = vi.fn()
const mockSetStateVscode = vi.fn()

;(globalThis as unknown as { acquireVsCodeApi: () => unknown }).acquireVsCodeApi = vi.fn(() => ({
  postMessage: mockPostMessage,
  getState: mockGetState,
  setState: mockSetStateVscode,
}))

// Track useEffect cleanups
let effectCleanup: (() => void) | undefined

const mockUseCallback = vi.fn((fn: unknown) => fn)
const mockUseEffect = vi.fn((fn: () => (() => void) | void) => {
  const result = fn()
  if (typeof result === 'function') {
    effectCleanup = result
  }
})
const mockUseRef = vi.fn((initial: unknown) => ({ current: initial }))

vi.mock('react', () => ({
  useCallback: (...args: unknown[]) => mockUseCallback(...args),
  useEffect: (...args: unknown[]) => mockUseEffect(...args),
  useRef: (...args: unknown[]) => mockUseRef(...args),
}))

import { useMessenger } from './useMessenger.js'

describe('useMessenger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    effectCleanup = undefined
  })

  it('retorna post, on e off', () => {
    const result = useMessenger()

    expect(result).toHaveProperty('post')
    expect(result).toHaveProperty('on')
    expect(result).toHaveProperty('off')
    expect(typeof result.post).toBe('function')
    expect(typeof result.on).toBe('function')
    expect(typeof result.off).toBe('function')
  })

  describe('post', () => {
    it('envia mensagem via acquireVsCodeApi().postMessage', () => {
      const { post } = useMessenger()

      post({ type: 'chat:send', content: 'hello' })

      expect(mockPostMessage).toHaveBeenCalledWith({ type: 'chat:send', content: 'hello' })
    })
  })

  describe('on', () => {
    it('registra handler no mapa de handlers', () => {
      const { on } = useMessenger()
      const handler = vi.fn()

      on('chat:event', handler)

      const handlersMap = mockUseRef.mock.results[0]?.value.current as Map<string, unknown[]>
      expect(handlersMap.get('chat:event')).toContain(handler)
    })
  })

  describe('off', () => {
    it('remove handler do mapa', () => {
      const { on, off } = useMessenger()
      const handler = vi.fn()

      on('chat:event', handler)
      off('chat:event', handler)

      const handlersMap = mockUseRef.mock.results[0]?.value.current as Map<string, unknown[]>
      expect(handlersMap.get('chat:event')).not.toContain(handler)
    })
  })

  describe('message listener', () => {
    it('registra listener de mensagem no window', () => {
      const spy = vi.spyOn(window, 'addEventListener')
      useMessenger()

      expect(spy).toHaveBeenCalledWith('message', expect.any(Function))
      spy.mockRestore()
    })

    it('remove listener no cleanup', () => {
      const spy = vi.spyOn(window, 'removeEventListener')
      useMessenger()

      if (effectCleanup) {
        effectCleanup()
      }

      expect(spy).toHaveBeenCalledWith('message', expect.any(Function))
      spy.mockRestore()
    })

    it('despacha mensagem para handlers registrados', () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const { on } = useMessenger()
      const handler = vi.fn()
      on('test:msg', handler)

      // Get the message handler registered with addEventListener
      const messageHandler = addSpy.mock.calls.find((c) => c[0] === 'message')?.[1] as (
        event: MessageEvent,
      ) => void

      messageHandler(
        new MessageEvent('message', {
          data: { type: 'test:msg', value: 42 },
        }),
      )

      expect(handler).toHaveBeenCalledWith({ type: 'test:msg', value: 42 })
      addSpy.mockRestore()
    })

    it('ignora mensagens sem type', () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const { on } = useMessenger()
      const handler = vi.fn()
      on('test', handler)

      const messageHandler = addSpy.mock.calls.find((c) => c[0] === 'message')?.[1] as (
        event: MessageEvent,
      ) => void

      messageHandler(
        new MessageEvent('message', {
          data: { value: 'no type' },
        }),
      )

      expect(handler).not.toHaveBeenCalled()
      addSpy.mockRestore()
    })

    it('ignora mensagens de tipo nao registrado', () => {
      const addSpy = vi.spyOn(window, 'addEventListener')
      const { on } = useMessenger()
      const handler = vi.fn()
      on('registered:type', handler)

      const messageHandler = addSpy.mock.calls.find((c) => c[0] === 'message')?.[1] as (
        event: MessageEvent,
      ) => void

      messageHandler(
        new MessageEvent('message', {
          data: { type: 'other:type' },
        }),
      )

      expect(handler).not.toHaveBeenCalled()
      addSpy.mockRestore()
    })
  })
})
