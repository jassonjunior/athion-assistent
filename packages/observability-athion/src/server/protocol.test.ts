/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, vi } from 'vitest'
import { PROTOCOL_VERSION, isFlowEvent, truncatePreview, wsToFlowEvent } from './protocol'
import type { WsServerMessage, FlowEventMessage } from './protocol'

// Mock crypto.randomUUID for deterministic tests
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-1234',
})

describe('protocol', () => {
  describe('PROTOCOL_VERSION', () => {
    it('should be defined as a string', () => {
      expect(typeof PROTOCOL_VERSION).toBe('string')
      expect(PROTOCOL_VERSION).toBe('1.0')
    })
  })

  describe('truncatePreview', () => {
    it('should return text as-is if shorter than maxLen', () => {
      expect(truncatePreview('hello')).toBe('hello')
    })

    it('should return text as-is if exactly maxLen', () => {
      const text = 'a'.repeat(200)
      expect(truncatePreview(text)).toBe(text)
    })

    it('should truncate and append ellipsis if longer than default maxLen', () => {
      const text = 'a'.repeat(250)
      const result = truncatePreview(text)
      expect(result).toHaveLength(203) // 200 + '...'
      expect(result.endsWith('...')).toBe(true)
    })

    it('should respect custom maxLen', () => {
      const text = 'a'.repeat(100)
      const result = truncatePreview(text, 50)
      expect(result).toHaveLength(53) // 50 + '...'
      expect(result.endsWith('...')).toBe(true)
    })

    it('should handle empty string', () => {
      expect(truncatePreview('')).toBe('')
    })

    it('should handle maxLen of 0', () => {
      expect(truncatePreview('hello', 0)).toBe('...')
    })
  })

  describe('isFlowEvent', () => {
    it('should return true for valid FlowEventMessage', () => {
      const msg: FlowEventMessage = {
        id: 'abc',
        type: 'tool_call',
        timestamp: Date.now(),
        data: { name: 'grep' },
      }
      expect(isFlowEvent(msg)).toBe(true)
    })

    it('should return true for FlowEventMessage with parentId', () => {
      const msg: FlowEventMessage = {
        id: 'abc',
        type: 'subagent_start',
        timestamp: Date.now(),
        data: { agentName: 'search' },
        parentId: 'parent-1',
      }
      expect(isFlowEvent(msg)).toBe(true)
    })

    it('should return false for WsServerMessage with tokens field', () => {
      const msg = {
        type: 'orch:content',
        content: 'hello',
        tokens: {
          contextLimit: 50000,
          estimatedInput: 100,
          estimatedOutput: 50,
          totalUsed: 150,
          percentUsed: 0.3,
        },
        ts: Date.now(),
        id: 'x',
        timestamp: Date.now(),
        data: {},
      }
      expect(isFlowEvent(msg)).toBe(false)
    })

    it('should return false for null', () => {
      expect(isFlowEvent(null)).toBe(false)
    })

    it('should return false for undefined', () => {
      expect(isFlowEvent(undefined)).toBe(false)
    })

    it('should return false for primitive values', () => {
      expect(isFlowEvent(42)).toBe(false)
      expect(isFlowEvent('string')).toBe(false)
      expect(isFlowEvent(true)).toBe(false)
    })

    it('should return false for object missing id', () => {
      expect(isFlowEvent({ timestamp: 1, data: {} })).toBe(false)
    })

    it('should return false for object missing timestamp', () => {
      expect(isFlowEvent({ id: '1', data: {} })).toBe(false)
    })

    it('should return false for object missing data', () => {
      expect(isFlowEvent({ id: '1', timestamp: 1 })).toBe(false)
    })
  })

  describe('wsToFlowEvent', () => {
    it('should convert orch:content to llm_content', () => {
      const msg: WsServerMessage = {
        type: 'orch:content',
        content: 'Hello world',
        tokens: {
          contextLimit: 50000,
          estimatedInput: 100,
          estimatedOutput: 50,
          totalUsed: 150,
          percentUsed: 0.3,
        },
        ts: 1000,
      }
      const result = wsToFlowEvent(msg)
      expect(result).not.toBeNull()
      expect(result!.type).toBe('llm_content')
      expect(result!.timestamp).toBe(1000)
      expect(result!.data.content).toBe('Hello world')
      expect(result!.data.type).toBeUndefined()
      expect(result!.data.ts).toBeUndefined()
      expect(result!.data.tokens).toBeUndefined()
    })

    it('should convert orch:tool_call to tool_call', () => {
      const msg: WsServerMessage = {
        type: 'orch:tool_call',
        id: 'tc-1',
        name: 'grep',
        args: { pattern: 'TODO' },
        tokens: {
          contextLimit: 50000,
          estimatedInput: 0,
          estimatedOutput: 0,
          totalUsed: 0,
          percentUsed: 0,
        },
        ts: 2000,
      }
      const result = wsToFlowEvent(msg)
      expect(result).not.toBeNull()
      expect(result!.type).toBe('tool_call')
      expect(result!.data.name).toBe('grep')
      expect(result!.data.args).toEqual({ pattern: 'TODO' })
    })

    it('should convert orch:error to error', () => {
      const msg: WsServerMessage = {
        type: 'orch:error',
        message: 'Something failed',
        tokens: {
          contextLimit: 50000,
          estimatedInput: 0,
          estimatedOutput: 0,
          totalUsed: 0,
          percentUsed: 0,
        },
        ts: 3000,
      }
      const result = wsToFlowEvent(msg)
      expect(result).not.toBeNull()
      expect(result!.type).toBe('error')
      expect(result!.data.message).toBe('Something failed')
    })

    it('should convert sub:start to subagent_start', () => {
      const msg: WsServerMessage = {
        type: 'sub:start',
        agentName: 'search',
        taskId: 'task-1',
        description: 'Find files',
        tokens: {
          contextLimit: 50000,
          estimatedInput: 0,
          estimatedOutput: 0,
          totalUsed: 0,
          percentUsed: 0,
        },
        ts: 4000,
      }
      const result = wsToFlowEvent(msg)
      expect(result).not.toBeNull()
      expect(result!.type).toBe('subagent_start')
      expect(result!.data.agentName).toBe('search')
    })

    it('should convert sub:tool_call to subagent_tool_call', () => {
      const msg: WsServerMessage = {
        type: 'sub:tool_call',
        toolName: 'read_file',
        args: { path: '/tmp/test' },
        tokens: {
          contextLimit: 50000,
          estimatedInput: 0,
          estimatedOutput: 0,
          totalUsed: 0,
          percentUsed: 0,
        },
        ts: 5000,
      }
      const result = wsToFlowEvent(msg)
      expect(result).not.toBeNull()
      expect(result!.type).toBe('subagent_tool_call')
    })

    it('should return null for non-convertible messages (protocol:version)', () => {
      const msg: WsServerMessage = {
        type: 'protocol:version',
        version: '1.0',
      }
      expect(wsToFlowEvent(msg)).toBeNull()
    })

    it('should return null for test:list messages', () => {
      const msg: WsServerMessage = {
        type: 'test:list',
        tests: [],
      }
      expect(wsToFlowEvent(msg)).toBeNull()
    })

    it('should return null for test:started messages', () => {
      const msg: WsServerMessage = {
        type: 'test:started',
        testName: 'test1',
        ts: 1000,
      }
      expect(wsToFlowEvent(msg)).toBeNull()
    })

    it('should return null for test:finished messages', () => {
      const msg: WsServerMessage = {
        type: 'test:finished',
        testName: 'test1',
        passed: true,
        duration: 500,
        ts: 1000,
      }
      expect(wsToFlowEvent(msg)).toBeNull()
    })

    it('should return null for setup:step messages', () => {
      const msg: WsServerMessage = {
        type: 'setup:step',
        step: '1/3',
        detail: 'Loading...',
        ts: 1000,
      }
      expect(wsToFlowEvent(msg)).toBeNull()
    })

    it('should generate a UUID for the id', () => {
      const msg: WsServerMessage = {
        type: 'orch:content',
        content: 'test',
        tokens: {
          contextLimit: 50000,
          estimatedInput: 0,
          estimatedOutput: 0,
          totalUsed: 0,
          percentUsed: 0,
        },
        ts: 1000,
      }
      const result = wsToFlowEvent(msg)
      expect(result!.id).toBe('test-uuid-1234')
    })

    it('should convert all sub: types', () => {
      const subTypes: Array<{ type: string; expected: string }> = [
        { type: 'sub:content', expected: 'subagent_content' },
        { type: 'sub:tool_result', expected: 'subagent_tool_result' },
        { type: 'sub:continuation', expected: 'subagent_continuation' },
        { type: 'sub:complete', expected: 'subagent_complete' },
        { type: 'sub:error', expected: 'subagent_error' },
      ]

      for (const { type, expected } of subTypes) {
        const msg = {
          type,
          ts: 1000,
          tokens: {
            contextLimit: 50000,
            estimatedInput: 0,
            estimatedOutput: 0,
            totalUsed: 0,
            percentUsed: 0,
          },
        } as unknown as WsServerMessage
        const result = wsToFlowEvent(msg)
        expect(result).not.toBeNull()
        expect(result!.type).toBe(expected)
      }
    })

    it('should convert all orch: types', () => {
      const orchTypes: Array<{ type: string; expected: string }> = [
        { type: 'orch:user_message', expected: 'user_message' },
        { type: 'orch:system_prompt', expected: 'system_prompt' },
        { type: 'orch:tool_result', expected: 'tool_result' },
        { type: 'orch:subagent_start', expected: 'subagent_start' },
        { type: 'orch:subagent_complete', expected: 'subagent_complete' },
        { type: 'orch:finish', expected: 'finish' },
      ]

      for (const { type, expected } of orchTypes) {
        const msg = {
          type,
          ts: 1000,
          tokens: {
            contextLimit: 50000,
            estimatedInput: 0,
            estimatedOutput: 0,
            totalUsed: 0,
            percentUsed: 0,
          },
        } as unknown as WsServerMessage
        const result = wsToFlowEvent(msg)
        expect(result).not.toBeNull()
        expect(result!.type).toBe(expected)
      }
    })
  })
})
