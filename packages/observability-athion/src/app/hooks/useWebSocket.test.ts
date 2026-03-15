import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWebSocket } from './useWebSocket'

// Mock WebSocket
class MockWebSocket {
  static OPEN = 1
  static CLOSED = 3
  static instances: MockWebSocket[] = []

  url: string
  readyState: number = 0
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  sentMessages: string[] = []
  closed = false

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sentMessages.push(data)
  }

  close() {
    this.closed = true
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.()
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data })
  }

  simulateError() {
    this.onerror?.()
  }
}

vi.stubGlobal('WebSocket', MockWebSocket)

describe('useWebSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.instances = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should start disconnected', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:3457/ws'))
    expect(result.current.connected).toBe(false)
  })

  it('should create a WebSocket connection', () => {
    renderHook(() => useWebSocket('ws://localhost:3457/ws'))
    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:3457/ws')
  })

  it('should set connected to true on open', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:3457/ws'))

    act(() => {
      MockWebSocket.instances[0].simulateOpen()
    })

    expect(result.current.connected).toBe(true)
  })

  it('should accumulate messages', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:3457/ws'))

    act(() => {
      MockWebSocket.instances[0].simulateOpen()
      MockWebSocket.instances[0].simulateMessage('{"type":"test:list","tests":[]}')
    })

    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0]).toEqual({ type: 'test:list', tests: [] })
  })

  it('should ignore invalid JSON messages', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:3457/ws'))

    act(() => {
      MockWebSocket.instances[0].simulateOpen()
      MockWebSocket.instances[0].simulateMessage('not json')
    })

    expect(result.current.messages).toHaveLength(0)
  })

  it('should send messages when connected', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:3457/ws'))

    act(() => {
      MockWebSocket.instances[0].simulateOpen()
    })

    act(() => {
      result.current.send({ type: 'test:list' })
    })

    expect(MockWebSocket.instances[0].sentMessages).toHaveLength(1)
    expect(JSON.parse(MockWebSocket.instances[0].sentMessages[0])).toEqual({ type: 'test:list' })
  })

  it('should not send messages when disconnected', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:3457/ws'))

    act(() => {
      result.current.send({ type: 'test:list' })
    })

    expect(MockWebSocket.instances[0].sentMessages).toHaveLength(0)
  })

  it('should clear messages', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:3457/ws'))

    act(() => {
      MockWebSocket.instances[0].simulateOpen()
      MockWebSocket.instances[0].simulateMessage('{"type":"test:list","tests":[]}')
    })

    expect(result.current.messages).toHaveLength(1)

    act(() => {
      result.current.clearMessages()
    })

    expect(result.current.messages).toHaveLength(0)
  })

  it('should set connected to false on close', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:3457/ws'))

    act(() => {
      MockWebSocket.instances[0].simulateOpen()
    })

    expect(result.current.connected).toBe(true)

    act(() => {
      MockWebSocket.instances[0].close()
    })

    expect(result.current.connected).toBe(false)
  })

  it('should attempt reconnection on close with exponential backoff', () => {
    renderHook(() => useWebSocket('ws://localhost:3457/ws'))
    const initialCount = MockWebSocket.instances.length

    act(() => {
      MockWebSocket.instances[0].simulateOpen()
      MockWebSocket.instances[0].close()
    })

    // First reconnect after 1s
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(MockWebSocket.instances.length).toBe(initialCount + 1)
  })

  it('should close WebSocket on unmount', () => {
    const { unmount } = renderHook(() => useWebSocket('ws://localhost:3457/ws'))

    act(() => {
      MockWebSocket.instances[0].simulateOpen()
    })

    unmount()

    expect(MockWebSocket.instances[0].closed).toBe(true)
  })

  it('should not connect if url is empty', () => {
    renderHook(() => useWebSocket(''))
    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('should limit messages to MAX_MESSAGES (5000)', () => {
    const { result } = renderHook(() => useWebSocket('ws://localhost:3457/ws'))

    act(() => {
      MockWebSocket.instances[0].simulateOpen()
      for (let i = 0; i < 5010; i++) {
        MockWebSocket.instances[0].simulateMessage(
          `{"type":"orch:content","content":"msg${i}","tokens":{},"ts":${i}}`,
        )
      }
    })

    expect(result.current.messages.length).toBeLessThanOrEqual(5000)
  })

  it('should close ws on error', () => {
    renderHook(() => useWebSocket('ws://localhost:3457/ws'))

    const ws = MockWebSocket.instances[0]
    ws.readyState = MockWebSocket.OPEN

    act(() => {
      ws.simulateError()
    })

    expect(ws.closed).toBe(true)
  })
})
