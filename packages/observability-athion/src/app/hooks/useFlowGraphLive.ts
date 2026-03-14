import { useEffect, useRef, useState } from 'react'
import type { Edge, Node } from '@xyflow/react'
import type { FlowEventMessage } from '../../server/protocol'
import type { NodeData } from './useFlowGraph'
import { applyDagreLayout } from '../layout/dagre-layout'

type FlowNode = Node<NodeData>

const TYPE_TO_NODE: Record<string, string> = {
  user_message: 'userMessageNode',
  system_prompt: 'systemPromptNode',
  llm_content: 'llmResponseNode',
  tool_call: 'toolCallNode',
  tool_result: 'toolResultNode',
  subagent_start: 'subAgentNode',
  subagent_content: 'llmResponseNode',
  subagent_tool_call: 'toolCallNode',
  subagent_tool_result: 'toolResultNode',
  subagent_continuation: 'continuationNode',
  subagent_complete: 'completeNode',
  model_loading: 'setupNode',
  model_ready: 'setupNode',
  finish: 'finishNode',
  error: 'errorNode',
}

function relativeTime(ts: number, startTs: number): string {
  return `+${((ts - startTs) / 1000).toFixed(1)}s`
}

interface GraphState {
  nodes: FlowNode[]
  edges: Edge[]
  /** Último nó do fluxo principal (orquestrador) */
  mainLastNodeId: string | null
  /** Último nó adicionado (qualquer nível) — usado para subagent linkage */
  contentNodeId: string | null
  /** Map: parentId do subagente → último nó dentro desse subagente */
  subagentLastNode: Map<string, string>
  /** Map: parentId do subagente → content node sendo merged */
  subagentContentNode: Map<string, string>
  /** Nó de onde subagentes ramificam (normalmente o tool_call que spawnou) */
  subagentBranchPoint: string | null
  startTs: number
  processedCount: number
  nodeCount: number
}

function createGraphState(): GraphState {
  return {
    nodes: [],
    edges: [],
    mainLastNodeId: null,
    contentNodeId: null,
    subagentLastNode: new Map(),
    subagentContentNode: new Map(),
    subagentBranchPoint: null,
    startTs: 0,
    processedCount: 0,
    nodeCount: 0,
  }
}

function addNode(
  state: GraphState,
  id: string,
  type: string,
  label: string,
  data: Partial<NodeData>,
  sourceId: string | null,
  isSubAgent: boolean,
): void {
  state.nodes.push({
    id,
    type,
    data: { label, isSubAgent, ...data } as NodeData,
    position: { x: 0, y: 0 },
  })

  if (sourceId) {
    state.edges.push({
      id: `e-${sourceId}-${id}`,
      source: sourceId,
      target: id,
      animated: data.status === 'running',
      style: isSubAgent ? { stroke: '#a78bfa', strokeDasharray: '5,5' } : undefined,
    })
  }

  state.nodeCount++
}

/** Adiciona nó ao fluxo principal do orquestrador */
function addMainNode(
  state: GraphState,
  id: string,
  type: string,
  label: string,
  data: Partial<NodeData> = {},
): void {
  addNode(state, id, type, label, data, state.mainLastNodeId, false)
  state.mainLastNodeId = id
}

/** Adiciona nó dentro do branch de um subagente */
function addSubNode(
  state: GraphState,
  id: string,
  type: string,
  label: string,
  data: Partial<NodeData>,
  parentId: string,
): void {
  // Source: último nó deste subagente, ou o branch point se é o primeiro
  const sourceId = state.subagentLastNode.get(parentId) ?? state.subagentBranchPoint
  addNode(state, id, type, label, { ...data, isSubAgent: true }, sourceId, true)
  state.subagentLastNode.set(parentId, id)
}

function processMessage(state: GraphState, msg: FlowEventMessage): boolean {
  const nodeType = TYPE_TO_NODE[msg.type]
  if (!nodeType) return false

  if (state.startTs === 0) state.startTs = msg.timestamp

  const ts = relativeTime(msg.timestamp, state.startTs)
  const d = msg.data
  let addedNode = false

  switch (msg.type) {
    case 'user_message':
      addMainNode(state, msg.id, nodeType, 'User Message', { detail: d.content as string })
      addedNode = true
      break

    case 'system_prompt':
      addMainNode(state, msg.id, nodeType, 'System Prompt', {
        detail: `${d.toolCount} tools, ${d.agentCount} agents (${d.length} chars)`,
      })
      addedNode = true
      break

    case 'llm_content':
      if (!state.contentNodeId) {
        state.contentNodeId = msg.id
        addMainNode(state, msg.id, nodeType, `LLM Response ${ts}`, {
          detail: d.content as string,
          status: 'running',
        })
        addedNode = true
      } else {
        const node = state.nodes.find((n) => n.id === state.contentNodeId)
        if (node) {
          node.data = {
            ...node.data,
            detail: ((node.data.detail as string) || '') + (d.content as string),
          }
        }
      }
      break

    case 'tool_call':
      state.contentNodeId = null
      addMainNode(state, msg.id, nodeType, `Tool: ${d.name} ${ts}`, {
        args: d.args,
        status: 'running',
      })
      // Subagentes spawnam a partir deste tool_call
      state.subagentBranchPoint = msg.id
      addedNode = true
      break

    case 'tool_result': {
      const success = d.success as boolean
      const tcNode = [...state.nodes]
        .reverse()
        .find((n) => n.type === 'toolCallNode' && n.data.status === 'running' && !n.data.isSubAgent)
      if (tcNode) {
        tcNode.data = {
          ...tcNode.data,
          status: success ? 'success' : 'error',
          preview: `${d.name}: ${success ? 'OK' : 'FAIL'}`,
        }
      }
      break
    }

    case 'subagent_start': {
      const agentParent = msg.parentId ?? msg.id
      state.subagentContentNode.delete(agentParent)
      addSubNode(
        state,
        msg.id,
        nodeType,
        `Agent: ${d.agentName} ${ts}`,
        {
          agentName: d.agentName as string,
          status: 'running',
        },
        agentParent,
      )
      addedNode = true
      break
    }

    case 'subagent_content': {
      const agentParent = msg.parentId ?? ''
      const contentId = state.subagentContentNode.get(agentParent)
      if (!contentId) {
        state.subagentContentNode.set(agentParent, msg.id)
        addSubNode(
          state,
          msg.id,
          nodeType,
          `Agent Response ${ts}`,
          {
            detail: (d.content as string) ?? (d.text as string),
            status: 'running',
          },
          agentParent,
        )
        addedNode = true
      } else {
        const node = state.nodes.find((n) => n.id === contentId)
        if (node) {
          const text = (d.content as string) ?? (d.text as string) ?? ''
          node.data = {
            ...node.data,
            detail: ((node.data.detail as string) || '') + text,
          }
        }
      }
      break
    }

    case 'subagent_tool_call': {
      const agentParent = msg.parentId ?? ''
      state.subagentContentNode.delete(agentParent)
      addSubNode(
        state,
        msg.id,
        nodeType,
        `Tool: ${d.toolName ?? d.name} ${ts}`,
        {
          args: d.args ?? d.input,
          status: 'running',
        },
        agentParent,
      )
      addedNode = true
      break
    }

    case 'subagent_tool_result': {
      const subSuccess = (d.success as boolean) ?? true
      const subTcNode = [...state.nodes]
        .reverse()
        .find((n) => n.type === 'toolCallNode' && n.data.status === 'running' && n.data.isSubAgent)
      if (subTcNode) {
        subTcNode.data = {
          ...subTcNode.data,
          status: subSuccess ? 'success' : 'error',
          preview: String(d.toolName ?? d.name ?? 'result'),
        }
      }
      break
    }

    case 'subagent_continuation': {
      const agentParent = msg.parentId ?? ''
      addSubNode(
        state,
        msg.id,
        nodeType,
        `Continuation ${ts}`,
        {
          detail: `Index: ${d.continuationIndex}`,
        },
        agentParent,
      )
      addedNode = true
      break
    }

    case 'subagent_complete': {
      const agentParent = msg.parentId ?? ''
      state.subagentContentNode.delete(agentParent)
      const agentNode = [...state.nodes]
        .reverse()
        .find((n) => n.type === 'subAgentNode' && n.data.status === 'running')
      if (agentNode) {
        agentNode.data = { ...agentNode.data, status: 'success' }
      }
      addSubNode(
        state,
        msg.id,
        'completeNode',
        `Agent Complete ${ts}`,
        {
          status: 'success',
          preview: String(d.agentName ?? ''),
        },
        agentParent,
      )
      addedNode = true
      break
    }

    case 'model_loading':
      addMainNode(state, msg.id, nodeType, `Loading: ${d.modelName} ${ts}`, {
        status: 'running',
      })
      addedNode = true
      break

    case 'model_ready': {
      const loadingNode = [...state.nodes]
        .reverse()
        .find((n) => n.data.status === 'running' && n.type === 'setupNode')
      if (loadingNode) {
        loadingNode.data = { ...loadingNode.data, status: 'success' }
      }
      break
    }

    case 'finish':
      state.contentNodeId = null
      addMainNode(state, msg.id, nodeType, `Finish ${ts}`, {
        detail: `Input: ${d.promptTokens} | Output: ${d.completionTokens} | Total: ${d.totalTokens}`,
        status: 'success',
      })
      addedNode = true
      break

    case 'error':
      addMainNode(state, msg.id, nodeType, `Error ${ts}`, {
        detail: (d.message as string) ?? 'Unknown error',
        status: 'error',
      })
      addedNode = true
      break
  }

  return addedNode
}

export function useFlowGraphLive(messages: FlowEventMessage[]): {
  nodes: FlowNode[]
  edges: Edge[]
} {
  const stateRef = useRef<GraphState>(createGraphState())
  const [result, setResult] = useState<{ nodes: FlowNode[]; edges: Edge[] }>({
    nodes: [],
    edges: [],
  })

  useEffect(() => {
    const state = stateRef.current

    if (messages.length === 0 && state.processedCount > 0) {
      stateRef.current = createGraphState()
      setResult({ nodes: [], edges: [] })
      return
    }

    if (messages.length < state.processedCount) {
      stateRef.current = createGraphState()
      stateRef.current.processedCount = 0
    }

    const startIdx = stateRef.current.processedCount
    if (startIdx >= messages.length) return

    let addedNewNodes = false
    for (let i = startIdx; i < messages.length; i++) {
      if (processMessage(stateRef.current, messages[i])) addedNewNodes = true
    }
    stateRef.current.processedCount = messages.length

    if (addedNewNodes) {
      const { nodes: layoutNodes, edges: layoutEdges } = applyDagreLayout(
        stateRef.current.nodes,
        stateRef.current.edges,
      )
      stateRef.current.nodes = layoutNodes
      stateRef.current.edges = layoutEdges
      setResult({ nodes: [...layoutNodes], edges: [...layoutEdges] })
    } else {
      setResult({ nodes: [...stateRef.current.nodes], edges: [...stateRef.current.edges] })
    }
  }, [messages])

  return result
}
