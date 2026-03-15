/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useFlowGraph } from './useFlowGraph'
import type { WsServerMessage } from '../../server/protocol'

// Mock dagre layout to just return positions as-is
vi.mock('../layout/dagre-layout', () => ({
  applyDagreLayout: (nodes: unknown[], edges: unknown[]) => ({ nodes, edges }),
}))

describe('useFlowGraph', () => {
  it('should return empty arrays for no messages', () => {
    const { result } = renderHook(() => useFlowGraph([]))
    expect(result.current.nodes).toEqual([])
    expect(result.current.edges).toEqual([])
  })

  it('should create a start node for test:started', () => {
    const messages: WsServerMessage[] = [{ type: 'test:started', testName: 'my-test', ts: 1000 }]
    const { result } = renderHook(() => useFlowGraph(messages))

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].data.label).toBe('Test: my-test')
    expect(result.current.nodes[0].data.status).toBe('running')
    expect(result.current.nodes[0].type).toBe('startNode')
  })

  it('should create user message node for orch:user_message', () => {
    const tokens = {
      contextLimit: 50000,
      estimatedInput: 100,
      estimatedOutput: 0,
      totalUsed: 100,
      percentUsed: 0.2,
    }
    const messages: WsServerMessage[] = [
      { type: 'orch:user_message', content: 'Hello', tokens, ts: 1000 },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].data.label).toBe('User Message')
    expect(result.current.nodes[0].data.detail).toBe('Hello')
    expect(result.current.nodes[0].type).toBe('userMessageNode')
  })

  it('should create edges between consecutive nodes', () => {
    const tokens = {
      contextLimit: 50000,
      estimatedInput: 0,
      estimatedOutput: 0,
      totalUsed: 0,
      percentUsed: 0,
    }
    const messages: WsServerMessage[] = [
      { type: 'test:started', testName: 'test1', ts: 1000 },
      { type: 'orch:user_message', content: 'Hello', tokens, ts: 1001 },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    expect(result.current.nodes).toHaveLength(2)
    expect(result.current.edges).toHaveLength(1)
    expect(result.current.edges[0].source).toBe(result.current.nodes[0].id)
    expect(result.current.edges[0].target).toBe(result.current.nodes[1].id)
  })

  it('should merge consecutive orch:content into single node', () => {
    const tokens = {
      contextLimit: 50000,
      estimatedInput: 0,
      estimatedOutput: 50,
      totalUsed: 50,
      percentUsed: 0.1,
    }
    const messages: WsServerMessage[] = [
      { type: 'orch:content', content: 'Hello ', tokens, ts: 1000 },
      { type: 'orch:content', content: 'World', tokens, ts: 1001 },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].data.detail).toBe('Hello World')
    expect(result.current.nodes[0].type).toBe('llmResponseNode')
  })

  it('should create tool call node for orch:tool_call', () => {
    const tokens = {
      contextLimit: 50000,
      estimatedInput: 0,
      estimatedOutput: 0,
      totalUsed: 0,
      percentUsed: 0,
    }
    const messages: WsServerMessage[] = [
      {
        type: 'orch:tool_call',
        id: 'tc-1',
        name: 'grep',
        args: { pattern: 'TODO' },
        tokens,
        ts: 1000,
      },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].data.label).toBe('Tool: grep')
    expect(result.current.nodes[0].data.status).toBe('running')
    expect(result.current.nodes[0].data.args).toEqual({ pattern: 'TODO' })
  })

  it('should update tool call node on orch:tool_result', () => {
    const tokens = {
      contextLimit: 50000,
      estimatedInput: 0,
      estimatedOutput: 0,
      totalUsed: 0,
      percentUsed: 0,
    }
    const messages: WsServerMessage[] = [
      { type: 'orch:tool_call', id: 'tc-1', name: 'grep', args: {}, tokens, ts: 1000 },
      {
        type: 'orch:tool_result',
        id: 'tc-1',
        name: 'grep',
        success: true,
        preview: 'found 5 matches',
        tokens,
        ts: 1001,
      },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    expect(result.current.nodes).toHaveLength(1) // tool_result updates, doesn't add
    expect(result.current.nodes[0].data.status).toBe('success')
    expect(result.current.nodes[0].data.preview).toBe('found 5 matches')
  })

  it('should mark tool call as error on failed tool_result', () => {
    const tokens = {
      contextLimit: 50000,
      estimatedInput: 0,
      estimatedOutput: 0,
      totalUsed: 0,
      percentUsed: 0,
    }
    const messages: WsServerMessage[] = [
      { type: 'orch:tool_call', id: 'tc-1', name: 'grep', args: {}, tokens, ts: 1000 },
      {
        type: 'orch:tool_result',
        id: 'tc-1',
        name: 'grep',
        success: false,
        preview: 'not found',
        tokens,
        ts: 1001,
      },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    expect(result.current.nodes[0].data.status).toBe('error')
  })

  it('should reset content node on tool_call (new LLM response after tool)', () => {
    const tokens = {
      contextLimit: 50000,
      estimatedInput: 0,
      estimatedOutput: 0,
      totalUsed: 0,
      percentUsed: 0,
    }
    const messages: WsServerMessage[] = [
      { type: 'orch:content', content: 'First', tokens, ts: 1000 },
      { type: 'orch:tool_call', id: 'tc-1', name: 'grep', args: {}, tokens, ts: 1001 },
      { type: 'orch:content', content: 'Second', tokens, ts: 1002 },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    // Should have 3 nodes: LLM Response, Tool Call, LLM Response
    expect(result.current.nodes).toHaveLength(3)
    expect(result.current.nodes[0].data.detail).toBe('First')
    expect(result.current.nodes[2].data.detail).toBe('Second')
  })

  it('should handle subagent flow', () => {
    const tokens = {
      contextLimit: 50000,
      estimatedInput: 0,
      estimatedOutput: 0,
      totalUsed: 0,
      percentUsed: 0,
    }
    const messages: WsServerMessage[] = [
      { type: 'orch:subagent_start', agentName: 'search', tokens, ts: 1000 },
      {
        type: 'sub:start',
        agentName: 'search',
        taskId: 't1',
        description: 'Find files',
        tokens,
        ts: 1001,
      },
      { type: 'sub:tool_call', toolName: 'grep', args: {}, tokens, ts: 1002 },
      { type: 'sub:tool_result', toolName: 'grep', success: true, preview: 'ok', tokens, ts: 1003 },
      { type: 'sub:complete', taskId: 't1', resultPreview: 'done', tokens, ts: 1004 },
      {
        type: 'orch:subagent_complete',
        agentName: 'search',
        resultPreview: 'done',
        tokens,
        ts: 1005,
      },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    // Agent start, sub start, sub tool_call (updated by tool_result), sub complete
    const agentNode = result.current.nodes.find((n) => n.type === 'subAgentNode')
    expect(agentNode).toBeDefined()
    expect(agentNode!.data.agentName).toBe('search')
    expect(agentNode!.data.status).toBe('success')

    const completeNode = result.current.nodes.find((n) => n.type === 'completeNode')
    expect(completeNode).toBeDefined()
  })

  it('should mark subagent nodes with isSubAgent flag', () => {
    const tokens = {
      contextLimit: 50000,
      estimatedInput: 0,
      estimatedOutput: 0,
      totalUsed: 0,
      percentUsed: 0,
    }
    const messages: WsServerMessage[] = [
      { type: 'orch:subagent_start', agentName: 'search', tokens, ts: 1000 },
      { type: 'sub:tool_call', toolName: 'grep', args: {}, tokens, ts: 1001 },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    // The sub:tool_call node should have isSubAgent = true
    const subToolNode = result.current.nodes.find((n) => n.data.label.includes('grep'))
    expect(subToolNode).toBeDefined()
    expect(subToolNode!.data.isSubAgent).toBe(true)
  })

  it('should style subagent edges with dashed stroke', () => {
    const tokens = {
      contextLimit: 50000,
      estimatedInput: 0,
      estimatedOutput: 0,
      totalUsed: 0,
      percentUsed: 0,
    }
    const messages: WsServerMessage[] = [
      { type: 'orch:subagent_start', agentName: 'search', tokens, ts: 1000 },
      { type: 'sub:tool_call', toolName: 'grep', args: {}, tokens, ts: 1001 },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    const subEdge = result.current.edges.find((e) => e.style?.strokeDasharray)
    expect(subEdge).toBeDefined()
    expect(subEdge!.style!.stroke).toBe('#a78bfa')
  })

  it('should create finish node for orch:finish', () => {
    const tokens = {
      contextLimit: 50000,
      estimatedInput: 1000,
      estimatedOutput: 500,
      totalUsed: 1500,
      percentUsed: 3,
    }
    const messages: WsServerMessage[] = [
      {
        type: 'orch:finish',
        promptTokens: 1000,
        completionTokens: 500,
        totalTokens: 1500,
        tokens,
        ts: 1000,
      },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].type).toBe('finishNode')
    expect(result.current.nodes[0].data.status).toBe('success')
  })

  it('should create error node for orch:error', () => {
    const tokens = {
      contextLimit: 50000,
      estimatedInput: 0,
      estimatedOutput: 0,
      totalUsed: 0,
      percentUsed: 0,
    }
    const messages: WsServerMessage[] = [
      { type: 'orch:error', message: 'Something broke', tokens, ts: 1000 },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].type).toBe('errorNode')
    expect(result.current.nodes[0].data.detail).toBe('Something broke')
    expect(result.current.nodes[0].data.status).toBe('error')
  })

  it('should update start node status on test:finished', () => {
    const messages: WsServerMessage[] = [
      { type: 'test:started', testName: 'test1', ts: 1000 },
      { type: 'test:finished', testName: 'test1', passed: true, duration: 500, ts: 1500 },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    const startNode = result.current.nodes.find((n) => n.type === 'startNode')
    expect(startNode).toBeDefined()
    expect(startNode!.data.status).toBe('success')
  })

  it('should mark start node as error when test fails', () => {
    const messages: WsServerMessage[] = [
      { type: 'test:started', testName: 'test1', ts: 1000 },
      { type: 'test:finished', testName: 'test1', passed: false, duration: 500, ts: 1500 },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    const startNode = result.current.nodes.find((n) => n.type === 'startNode')
    expect(startNode!.data.status).toBe('error')
  })

  it('should create continuation node for sub:continuation', () => {
    const tokens = {
      contextLimit: 50000,
      estimatedInput: 0,
      estimatedOutput: 0,
      totalUsed: 0,
      percentUsed: 0,
    }
    const messages: WsServerMessage[] = [
      { type: 'sub:continuation', continuationIndex: 2, accumulatedCount: 5, tokens, ts: 1000 },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].type).toBe('continuationNode')
    expect(result.current.nodes[0].data.label).toBe('Continuation #3')
    expect(result.current.nodes[0].data.detail).toBe('Accumulated: 5 results')
  })

  it('should merge sub:content into single node', () => {
    const tokens = {
      contextLimit: 50000,
      estimatedInput: 0,
      estimatedOutput: 0,
      totalUsed: 0,
      percentUsed: 0,
    }
    const messages: WsServerMessage[] = [
      { type: 'orch:subagent_start', agentName: 'search', tokens, ts: 1000 },
      { type: 'sub:content', content: 'Part 1', tokens, ts: 1001 },
      { type: 'sub:content', content: ' Part 2', tokens, ts: 1002 },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    const contentNodes = result.current.nodes.filter((n) => n.type === 'llmResponseNode')
    expect(contentNodes).toHaveLength(1)
    expect(contentNodes[0].data.detail).toBe('Part 1 Part 2')
  })

  it('should create setup node for setup:tools', () => {
    const messages: WsServerMessage[] = [
      { type: 'setup:tools', tools: ['grep', 'read_file', 'write_file'], ts: 1000 },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].type).toBe('setupNode')
    expect(result.current.nodes[0].data.detail).toBe('Tools: grep, read_file, write_file')
  })

  it('should ignore setup:agents messages (no node created)', () => {
    const messages: WsServerMessage[] = [
      { type: 'setup:agents', agents: ['search', 'explainer'], ts: 1000 },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    expect(result.current.nodes).toHaveLength(0)
  })

  it('should create system prompt node for orch:system_prompt', () => {
    const tokens = {
      contextLimit: 50000,
      estimatedInput: 500,
      estimatedOutput: 0,
      totalUsed: 500,
      percentUsed: 1,
    }
    const messages: WsServerMessage[] = [
      { type: 'orch:system_prompt', preview: 'You are...', fullLength: 2000, tokens, ts: 1000 },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    expect(result.current.nodes).toHaveLength(1)
    expect(result.current.nodes[0].type).toBe('systemPromptNode')
    expect(result.current.nodes[0].data.detail).toBe('You are...')
  })

  it('should handle sub:error', () => {
    const tokens = {
      contextLimit: 50000,
      estimatedInput: 0,
      estimatedOutput: 0,
      totalUsed: 0,
      percentUsed: 0,
    }
    const messages: WsServerMessage[] = [
      { type: 'orch:subagent_start', agentName: 'search', tokens, ts: 1000 },
      { type: 'sub:error', message: 'Agent failed', tokens, ts: 1001 },
    ]
    const { result } = renderHook(() => useFlowGraph(messages))

    const errNode = result.current.nodes.find((n) => n.type === 'errorNode')
    expect(errNode).toBeDefined()
    expect(errNode!.data.detail).toBe('Agent failed')
    expect(errNode!.data.status).toBe('error')
  })
})
