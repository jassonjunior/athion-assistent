import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { startFlowBridge } from './flow-bridge'

// Mock @athion/core
vi.mock('@athion/core', () => ({
  listFlowPorts: vi.fn(() => []),
}))

import { listFlowPorts } from '@athion/core'

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = []
  url: string
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }

  close() {
    this.closed = true
    this.onclose?.()
  }

  simulateOpen() {
    this.onopen?.()
  }

  simulateMessage(data: string) {
    this.onmessage?.({ data })
  }

  simulateError() {
    this.onerror?.()
  }

  simulateClose() {
    this.onclose?.()
  }
}

vi.stubGlobal('WebSocket', MockWebSocket)

describe('flow-bridge', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockWebSocket.instances = []
    vi.mocked(listFlowPorts).mockReturnValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should return a cleanup function', () => {
    const broadcast = vi.fn()
    const stop = startFlowBridge(broadcast)
    expect(typeof stop).toBe('function')
    stop()
  })

  it('should call discover on startup', () => {
    const broadcast = vi.fn()
    const stop = startFlowBridge(broadcast)
    expect(listFlowPorts).toHaveBeenCalledTimes(1)
    stop()
  })

  it('should connect to discovered FlowServer instances', () => {
    vi.mocked(listFlowPorts).mockReturnValue([
      { pid: 1234, port: 9000, startedAt: new Date().toISOString() },
    ])
    const broadcast = vi.fn()
    const stop = startFlowBridge(broadcast)

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:9000')
    stop()
  })

  it('should broadcast messages received from FlowServer', () => {
    vi.mocked(listFlowPorts).mockReturnValue([
      { pid: 1234, port: 9000, startedAt: new Date().toISOString() },
    ])
    const broadcast = vi.fn()
    const stop = startFlowBridge(broadcast)

    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()
    ws.simulateMessage('{"type":"tool_call","id":"1"}')

    expect(broadcast).toHaveBeenCalledWith('{"type":"tool_call","id":"1"}')
    stop()
  })

  it('should not connect to same pid twice', () => {
    vi.mocked(listFlowPorts).mockReturnValue([
      { pid: 1234, port: 9000, startedAt: new Date().toISOString() },
    ])
    const broadcast = vi.fn()
    const stop = startFlowBridge(broadcast)

    expect(MockWebSocket.instances).toHaveLength(1)

    // Trigger another discovery interval
    vi.advanceTimersByTime(3000)

    // Should still have only 1 connection
    expect(MockWebSocket.instances).toHaveLength(1)
    stop()
  })

  it('should discover new instances on polling interval', () => {
    vi.mocked(listFlowPorts).mockReturnValue([])
    const broadcast = vi.fn()
    const stop = startFlowBridge(broadcast)

    expect(MockWebSocket.instances).toHaveLength(0)

    // New instance appears
    vi.mocked(listFlowPorts).mockReturnValue([
      { pid: 5678, port: 9001, startedAt: new Date().toISOString() },
    ])
    vi.advanceTimersByTime(3000)

    expect(MockWebSocket.instances).toHaveLength(1)
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost:9001')
    stop()
  })

  it('should close connections for dead instances', () => {
    vi.mocked(listFlowPorts).mockReturnValue([
      { pid: 1234, port: 9000, startedAt: new Date().toISOString() },
    ])
    const broadcast = vi.fn()
    const stop = startFlowBridge(broadcast)

    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()

    // Instance disappears
    vi.mocked(listFlowPorts).mockReturnValue([])
    vi.advanceTimersByTime(3000)

    expect(ws.closed).toBe(true)
    stop()
  })

  it('should remove connection on ws close', () => {
    vi.mocked(listFlowPorts).mockReturnValue([
      { pid: 1234, port: 9000, startedAt: new Date().toISOString() },
    ])
    const broadcast = vi.fn()
    const stop = startFlowBridge(broadcast)

    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()
    ws.simulateClose()

    // Should be able to reconnect on next discovery
    vi.mocked(listFlowPorts).mockReturnValue([
      { pid: 1234, port: 9000, startedAt: new Date().toISOString() },
    ])
    vi.advanceTimersByTime(3000)

    expect(MockWebSocket.instances).toHaveLength(2)
    stop()
  })

  it('should stop discovering after cleanup', () => {
    const broadcast = vi.fn()
    const stop = startFlowBridge(broadcast)
    stop()

    vi.mocked(listFlowPorts).mockReturnValue([
      { pid: 9999, port: 9999, startedAt: new Date().toISOString() },
    ])
    vi.advanceTimersByTime(3000)

    // Should not have created new connections after stop
    expect(MockWebSocket.instances).toHaveLength(0)
  })

  it('should close all connections on cleanup', () => {
    vi.mocked(listFlowPorts).mockReturnValue([
      { pid: 1, port: 9001, startedAt: new Date().toISOString() },
      { pid: 2, port: 9002, startedAt: new Date().toISOString() },
    ])
    const broadcast = vi.fn()
    const stop = startFlowBridge(broadcast)

    expect(MockWebSocket.instances).toHaveLength(2)
    stop()

    for (const ws of MockWebSocket.instances) {
      expect(ws.closed).toBe(true)
    }
  })

  it('should handle discovery errors gracefully', () => {
    vi.mocked(listFlowPorts).mockImplementation(() => {
      throw new Error('filesystem error')
    })
    const broadcast = vi.fn()

    // Should not throw
    const stop = startFlowBridge(broadcast)
    expect(MockWebSocket.instances).toHaveLength(0)
    stop()
  })

  it('should handle string data in ws messages', () => {
    vi.mocked(listFlowPorts).mockReturnValue([
      { pid: 1, port: 9000, startedAt: new Date().toISOString() },
    ])
    const broadcast = vi.fn()
    const stop = startFlowBridge(broadcast)

    const ws = MockWebSocket.instances[0]
    ws.simulateOpen()
    ws.simulateMessage('raw string data')

    expect(broadcast).toHaveBeenCalledWith('raw string data')
    stop()
  })
})
