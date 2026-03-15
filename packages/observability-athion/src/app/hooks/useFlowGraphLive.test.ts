/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useFlowGraphLive } from './useFlowGraphLive'
import type { FlowEventMessage } from '../../server/protocol'

// Mock dagre layout to return positions as-is
vi.mock('../layout/dagre-layout', () => ({
  applyDagreLayout: (nodes: unknown[], edges: unknown[]) => ({ nodes, edges }),
}))

function makeFlowEvent(overrides: Partial<FlowEventMessage> & { type: string }): FlowEventMessage {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    data: {},
    ...overrides,
  }
}

describe('useFlowGraphLive', () => {
  it('should return empty arrays for no messages', () => {
    const { result } = renderHook(() => useFlowGraphLive([]))
    expect(result.current.nodes).toEqual([])
    expect(result.current.edges).toEqual([])
  })

  it('should create node for user_message', () => {
    const messages: FlowEventMessage[] = [
      makeFlowEvent({ type: 'user_message', data: { content: 'Hello' } }),
    ]
    const { result } = renderHook(() => useFlowGraphLive(messages))

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].data.label).toBe('User Message')
    expect(result.current.nodes[0].data.detail).toBe('Hello')
  })

  it('should create node for system_prompt', () => {
    const messages: FlowEventMessage[] = [
      makeFlowEvent({ type: 'system_prompt', data: { toolCount: 5, agentCount: 3, length: 2000 } }),
    ]
    const { result } = renderHook(() => useFlowGraphLive(messages))

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].data.detail).toContain('5 tools')
    expect(result.current.nodes[0].data.detail).toContain('3 agents')
  })

  it('should merge consecutive llm_content into single node', () => {
    const ts = Date.now()
    const messages: FlowEventMessage[] = [
      makeFlowEvent({ id: 'c1', type: 'llm_content', data: { content: 'Hello ' }, timestamp: ts }),
      makeFlowEvent({
        id: 'c2',
        type: 'llm_content',
        data: { content: 'World' },
        timestamp: ts + 100,
      }),
    ]
    const { result } = renderHook(() => useFlowGraphLive(messages))

    const contentNodes = result.current.nodes.filter((n) => n.type === 'llmResponseNode')
    expect(contentNodes).toHaveLength(1)
    expect(contentNodes[0].data.detail).toBe('Hello World')
  })

  it('should create tool_call node with running status', () => {
    const messages: FlowEventMessage[] = [
      makeFlowEvent({ type: 'tool_call', data: { name: 'grep', args: { pattern: 'TODO' } } }),
    ]
    const { result } = renderHook(() => useFlowGraphLive(messages))

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].type).toBe('toolCallNode')
    expect(result.current.nodes[0].data.status).toBe('running')
  })

  it('should update tool_call node on tool_result', () => {
    const messages: FlowEventMessage[] = [
      makeFlowEvent({ type: 'tool_call', data: { name: 'grep', args: {} } }),
      makeFlowEvent({ type: 'tool_result', data: { name: 'grep', success: true } }),
    ]
    const { result } = renderHook(() => useFlowGraphLive(messages))

    const toolNode = result.current.nodes.find((n) => n.type === 'toolCallNode')
    expect(toolNode).toBeDefined()
    expect(toolNode!.data.status).toBe('success')
  })

  it('should mark tool_call as error on failed result', () => {
    const messages: FlowEventMessage[] = [
      makeFlowEvent({ type: 'tool_call', data: { name: 'grep', args: {} } }),
      makeFlowEvent({ type: 'tool_result', data: { name: 'grep', success: false } }),
    ]
    const { result } = renderHook(() => useFlowGraphLive(messages))

    const toolNode = result.current.nodes.find((n) => n.type === 'toolCallNode')
    expect(toolNode!.data.status).toBe('error')
  })

  it('should handle subagent_start as subagent node', () => {
    const parentId = 'parent-1'
    const messages: FlowEventMessage[] = [
      makeFlowEvent({ type: 'tool_call', data: { name: 'delegate', args: {} } }),
      makeFlowEvent({ type: 'subagent_start', data: { agentName: 'search' }, parentId }),
    ]
    const { result } = renderHook(() => useFlowGraphLive(messages))

    const agentNode = result.current.nodes.find((n) => n.type === 'subAgentNode')
    expect(agentNode).toBeDefined()
    expect(agentNode!.data.agentName).toBe('search')
    expect(agentNode!.data.status).toBe('running')
  })

  it('should create edges between main flow nodes', () => {
    const ts = Date.now()
    const messages: FlowEventMessage[] = [
      makeFlowEvent({ type: 'user_message', data: { content: 'Hello' }, timestamp: ts }),
      makeFlowEvent({ type: 'tool_call', data: { name: 'grep', args: {} }, timestamp: ts + 100 }),
    ]
    const { result } = renderHook(() => useFlowGraphLive(messages))

    expect(result.current.edges).toHaveLength(1)
    expect(result.current.edges[0].source).toBe(result.current.nodes[0].id)
    expect(result.current.edges[0].target).toBe(result.current.nodes[1].id)
  })

  it('should create finish node', () => {
    const messages: FlowEventMessage[] = [
      makeFlowEvent({
        type: 'finish',
        data: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
      }),
    ]
    const { result } = renderHook(() => useFlowGraphLive(messages))

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].type).toBe('finishNode')
    expect(result.current.nodes[0].data.status).toBe('success')
  })

  it('should create error node', () => {
    const messages: FlowEventMessage[] = [
      makeFlowEvent({ type: 'error', data: { message: 'Something broke' } }),
    ]
    const { result } = renderHook(() => useFlowGraphLive(messages))

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].type).toBe('errorNode')
    expect(result.current.nodes[0].data.detail).toBe('Something broke')
  })

  it('should reset state when messages array becomes empty', () => {
    const messages: FlowEventMessage[] = [
      makeFlowEvent({ type: 'user_message', data: { content: 'Hello' } }),
    ]
    const { result, rerender } = renderHook(({ msgs }) => useFlowGraphLive(msgs), {
      initialProps: { msgs: messages },
    })

    expect(result.current.nodes).toHaveLength(1)

    act(() => {
      rerender({ msgs: [] })
    })

    expect(result.current.nodes).toEqual([])
    expect(result.current.edges).toEqual([])
  })

  it('should incrementally process new messages', () => {
    const msg1 = makeFlowEvent({ type: 'user_message', data: { content: 'Hello' } })
    const msg2 = makeFlowEvent({ type: 'tool_call', data: { name: 'grep', args: {} } })

    const { result, rerender } = renderHook(({ msgs }) => useFlowGraphLive(msgs), {
      initialProps: { msgs: [msg1] },
    })

    expect(result.current.nodes).toHaveLength(1)

    act(() => {
      rerender({ msgs: [msg1, msg2] })
    })

    expect(result.current.nodes).toHaveLength(2)
  })

  it('should handle model_loading and model_ready', () => {
    const messages: FlowEventMessage[] = [
      makeFlowEvent({ type: 'model_loading', data: { modelName: 'llama3' } }),
      makeFlowEvent({ type: 'model_ready', data: { modelName: 'llama3' } }),
    ]
    const { result } = renderHook(() => useFlowGraphLive(messages))

    const setupNode = result.current.nodes.find((n) => n.type === 'setupNode')
    expect(setupNode).toBeDefined()
    expect(setupNode!.data.status).toBe('success')
  })

  it('should handle subagent_complete', () => {
    const parentId = 'parent-1'
    const messages: FlowEventMessage[] = [
      makeFlowEvent({ type: 'tool_call', data: { name: 'delegate', args: {} } }),
      makeFlowEvent({ type: 'subagent_start', data: { agentName: 'search' }, parentId }),
      makeFlowEvent({ type: 'subagent_complete', data: { agentName: 'search' }, parentId }),
    ]
    const { result } = renderHook(() => useFlowGraphLive(messages))

    const agentNode = result.current.nodes.find((n) => n.type === 'subAgentNode')
    expect(agentNode!.data.status).toBe('success')

    const completeNode = result.current.nodes.find((n) => n.type === 'completeNode')
    expect(completeNode).toBeDefined()
  })

  it('should ignore unknown message types', () => {
    const messages: FlowEventMessage[] = [makeFlowEvent({ type: 'unknown_type', data: {} })]
    const { result } = renderHook(() => useFlowGraphLive(messages))

    expect(result.current.nodes).toEqual([])
  })

  it('should handle subagent_tool_call and subagent_tool_result', () => {
    const parentId = 'parent-1'
    const messages: FlowEventMessage[] = [
      makeFlowEvent({ type: 'tool_call', data: { name: 'delegate', args: {} } }),
      makeFlowEvent({ type: 'subagent_start', data: { agentName: 'search' }, parentId }),
      makeFlowEvent({ type: 'subagent_tool_call', data: { toolName: 'grep', args: {} }, parentId }),
      makeFlowEvent({
        type: 'subagent_tool_result',
        data: { toolName: 'grep', success: true },
        parentId,
      }),
    ]
    const { result } = renderHook(() => useFlowGraphLive(messages))

    const subToolNodes = result.current.nodes.filter(
      (n) => n.type === 'toolCallNode' && n.data.isSubAgent,
    )
    expect(subToolNodes).toHaveLength(1)
    expect(subToolNodes[0].data.status).toBe('success')
  })

  it('should handle subagent_continuation', () => {
    const parentId = 'parent-1'
    const messages: FlowEventMessage[] = [
      makeFlowEvent({ type: 'tool_call', data: { name: 'delegate', args: {} } }),
      makeFlowEvent({ type: 'subagent_start', data: { agentName: 'search' }, parentId }),
      makeFlowEvent({ type: 'subagent_continuation', data: { continuationIndex: 1 }, parentId }),
    ]
    const { result } = renderHook(() => useFlowGraphLive(messages))

    const contNode = result.current.nodes.find((n) => n.type === 'continuationNode')
    expect(contNode).toBeDefined()
    expect(contNode!.data.detail).toContain('Index: 1')
  })
})
