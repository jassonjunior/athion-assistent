import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTokenTracker } from './useTokenTracker'
import type { WsServerMessage } from '../../server/protocol'

describe('useTokenTracker', () => {
  it('should return empty state for no messages', () => {
    const { result } = renderHook(() => useTokenTracker([]))
    expect(result.current).toEqual({
      contextLimit: 50_000,
      totalUsed: 0,
      percentUsed: 0,
      estimatedInput: 0,
      estimatedOutput: 0,
    })
  })

  it('should extract tokens from the last message that has them', () => {
    const tokens = {
      contextLimit: 50_000,
      estimatedInput: 1000,
      estimatedOutput: 500,
      totalUsed: 1500,
      percentUsed: 3,
    }
    const messages: WsServerMessage[] = [
      { type: 'orch:content', content: 'hello', tokens, ts: 1000 },
    ]
    const { result } = renderHook(() => useTokenTracker(messages))

    expect(result.current.contextLimit).toBe(50_000)
    expect(result.current.totalUsed).toBe(1500)
    expect(result.current.percentUsed).toBe(3)
    expect(result.current.estimatedInput).toBe(1000)
    expect(result.current.estimatedOutput).toBe(500)
  })

  it('should use the latest message with tokens, not the first', () => {
    const earlyTokens = {
      contextLimit: 50_000,
      estimatedInput: 100,
      estimatedOutput: 50,
      totalUsed: 150,
      percentUsed: 0.3,
    }
    const lateTokens = {
      contextLimit: 50_000,
      estimatedInput: 5000,
      estimatedOutput: 2000,
      totalUsed: 7000,
      percentUsed: 14,
    }
    const messages: WsServerMessage[] = [
      { type: 'orch:content', content: 'a', tokens: earlyTokens, ts: 1000 },
      { type: 'orch:content', content: 'b', tokens: lateTokens, ts: 2000 },
    ]
    const { result } = renderHook(() => useTokenTracker(messages))

    expect(result.current.totalUsed).toBe(7000)
    expect(result.current.percentUsed).toBe(14)
  })

  it('should skip messages without tokens', () => {
    const tokens = {
      contextLimit: 50_000,
      estimatedInput: 200,
      estimatedOutput: 100,
      totalUsed: 300,
      percentUsed: 0.6,
    }
    const messages: WsServerMessage[] = [
      { type: 'orch:content', content: 'a', tokens, ts: 1000 },
      { type: 'test:started', testName: 'test1', ts: 2000 }, // no tokens
    ]
    const { result } = renderHook(() => useTokenTracker(messages))

    expect(result.current.totalUsed).toBe(300)
  })

  it('should handle messages list with only non-token messages', () => {
    const messages: WsServerMessage[] = [
      { type: 'test:started', testName: 'test1', ts: 1000 },
      { type: 'test:list', tests: [] },
      { type: 'protocol:version', version: '1.0' },
    ]
    const { result } = renderHook(() => useTokenTracker(messages))

    expect(result.current).toEqual({
      contextLimit: 50_000,
      totalUsed: 0,
      percentUsed: 0,
      estimatedInput: 0,
      estimatedOutput: 0,
    })
  })

  it('should work with orch:finish messages', () => {
    const tokens = {
      contextLimit: 50_000,
      estimatedInput: 10000,
      estimatedOutput: 5000,
      totalUsed: 15000,
      percentUsed: 30,
    }
    const messages: WsServerMessage[] = [
      {
        type: 'orch:finish',
        promptTokens: 10000,
        completionTokens: 5000,
        totalTokens: 15000,
        tokens,
        ts: 1000,
      },
    ]
    const { result } = renderHook(() => useTokenTracker(messages))

    expect(result.current.totalUsed).toBe(15000)
    expect(result.current.percentUsed).toBe(30)
  })

  it('should work with sub:* messages that have tokens', () => {
    const tokens = {
      contextLimit: 50_000,
      estimatedInput: 300,
      estimatedOutput: 150,
      totalUsed: 450,
      percentUsed: 0.9,
    }
    const messages: WsServerMessage[] = [
      {
        type: 'sub:start',
        agentName: 'search',
        taskId: 't1',
        description: 'Find files',
        tokens,
        ts: 1000,
      },
    ]
    const { result } = renderHook(() => useTokenTracker(messages))

    expect(result.current.totalUsed).toBe(450)
  })
})
