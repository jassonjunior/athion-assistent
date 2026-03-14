import { useEffect, useRef, useState } from 'react'
import type { Edge, Node } from '@xyflow/react'
import type { FlowEventMessage } from '../../server/protocol'
import type { NodeData } from './useFlowGraph'
import { applyDagreLayout } from '../layout/dagre-layout'

type FlowNode = Node<NodeData>

/** Mapeia flowEvent.type para nodeType do React Flow */
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
  const diff = (ts - startTs) / 1000
  return `+${diff.toFixed(1)}s`
}

/** Estado interno do builder de grafo (preservado entre renders) */
interface GraphState {
  nodes: FlowNode[]
  edges: Edge[]
  lastNodeId: string | null
  contentNodeId: string | null
  subContentNodeId: string | null
  startTs: number
  parentLastChild: Map<string, string>
  processedCount: number
  nodeCount: number
}

function createGraphState(): GraphState {
  return {
    nodes: [],
    edges: [],
    lastNodeId: null,
    contentNodeId: null,
    subContentNodeId: null,
    startTs: 0,
    parentLastChild: new Map(),
    processedCount: 0,
    nodeCount: 0,
  }
}

function addNodeToState(
  state: GraphState,
  id: string,
  type: string,
  label: string,
  data: Partial<NodeData> = {},
  parentId?: string,
): void {
  const isSubAgent = !!parentId
  state.nodes.push({
    id,
    type,
    data: { label, isSubAgent, ...data } as NodeData,
    position: { x: 0, y: 0 },
  })

  const sourceId = parentId
    ? (state.parentLastChild.get(parentId) ?? state.lastNodeId)
    : state.lastNodeId
  if (sourceId) {
    state.edges.push({
      id: `e-${sourceId}-${id}`,
      source: sourceId,
      target: id,
      animated: data.status === 'running',
      style: isSubAgent ? { stroke: '#a78bfa', strokeDasharray: '5,5' } : undefined,
    })
  }

  if (parentId) {
    state.parentLastChild.set(parentId, id)
  }
  state.lastNodeId = id
  state.nodeCount++
}

/** Processa UMA mensagem e atualiza o estado do grafo in-place */
function processMessage(state: GraphState, msg: FlowEventMessage): boolean {
  const nodeType = TYPE_TO_NODE[msg.type]
  if (!nodeType) return false

  if (state.startTs === 0) state.startTs = msg.timestamp

  const ts = relativeTime(msg.timestamp, state.startTs)
  const d = msg.data
  let addedNode = false

  switch (msg.type) {
    case 'user_message':
      addNodeToState(state, msg.id, nodeType, 'User Message', { detail: d.content as string })
      addedNode = true
      break

    case 'system_prompt':
      addNodeToState(state, msg.id, nodeType, 'System Prompt', {
        detail: `${d.toolCount} tools, ${d.agentCount} agents (${d.length} chars)`,
      })
      addedNode = true
      break

    case 'llm_content':
      if (!state.contentNodeId) {
        state.contentNodeId = msg.id
        addNodeToState(state, msg.id, nodeType, `LLM Response ${ts}`, {
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
      addNodeToState(state, msg.id, nodeType, `Tool: ${d.name} ${ts}`, {
        args: d.args,
        status: 'running',
      })
      addedNode = true
      break

    case 'tool_result': {
      const success = d.success as boolean
      const tcNode = [...state.nodes]
        .reverse()
        .find((n) => n.type === 'toolCallNode' && n.data.status === 'running')
      if (tcNode) {
        tcNode.data = {
          ...tcNode.data,
          status: success ? 'success' : 'error',
          preview: `${d.name}: ${success ? 'OK' : 'FAIL'}`,
        }
      }
      break
    }

    case 'subagent_start':
      state.subContentNodeId = null
      addNodeToState(
        state,
        msg.id,
        nodeType,
        `Agent: ${d.agentName} ${ts}`,
        { agentName: d.agentName as string, status: 'running' },
        msg.parentId,
      )
      addedNode = true
      break

    case 'subagent_content':
      if (!state.subContentNodeId) {
        state.subContentNodeId = msg.id
        addNodeToState(
          state,
          msg.id,
          nodeType,
          `Agent Response ${ts}`,
          { detail: (d.content as string) ?? (d.text as string), status: 'running' },
          msg.parentId,
        )
        addedNode = true
      } else {
        const node = state.nodes.find((n) => n.id === state.subContentNodeId)
        if (node) {
          const text = (d.content as string) ?? (d.text as string) ?? ''
          node.data = {
            ...node.data,
            detail: ((node.data.detail as string) || '') + text,
          }
        }
      }
      break

    case 'subagent_tool_call':
      state.subContentNodeId = null
      addNodeToState(
        state,
        msg.id,
        nodeType,
        `Tool: ${d.toolName ?? d.name} ${ts}`,
        { args: d.args ?? d.input, status: 'running' },
        msg.parentId,
      )
      addedNode = true
      break

    case 'subagent_tool_result': {
      const subSuccess = (d.success as boolean) ?? true
      const subTcNode = [...state.nodes]
        .reverse()
        .find((n) => n.type === 'toolCallNode' && n.data.status === 'running')
      if (subTcNode) {
        subTcNode.data = {
          ...subTcNode.data,
          status: subSuccess ? 'success' : 'error',
          preview: String(d.toolName ?? d.name ?? 'result'),
        }
      }
      break
    }

    case 'subagent_continuation':
      addNodeToState(
        state,
        msg.id,
        nodeType,
        `Continuation ${ts}`,
        { detail: `Index: ${d.continuationIndex}` },
        msg.parentId,
      )
      addedNode = true
      break

    case 'subagent_complete': {
      state.subContentNodeId = null
      const agentNode = [...state.nodes]
        .reverse()
        .find((n) => n.type === 'subAgentNode' && n.data.status === 'running')
      if (agentNode) {
        agentNode.data = { ...agentNode.data, status: 'success' }
      }
      addNodeToState(
        state,
        msg.id,
        'completeNode',
        `Agent Complete ${ts}`,
        { status: 'success', preview: String(d.agentName ?? '') },
        msg.parentId,
      )
      addedNode = true
      break
    }

    case 'model_loading':
      addNodeToState(state, msg.id, nodeType, `Loading: ${d.modelName} ${ts}`, {
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
      addNodeToState(state, msg.id, nodeType, `Finish ${ts}`, {
        detail: `Input: ${d.promptTokens} | Output: ${d.completionTokens} | Total: ${d.totalTokens}`,
        status: 'success',
      })
      addedNode = true
      break

    case 'error':
      addNodeToState(state, msg.id, nodeType, `Error ${ts}`, {
        detail: (d.message as string) ?? 'Unknown error',
        status: 'error',
      })
      addedNode = true
      break
  }

  return addedNode
}

/** Constroi grafo de nodes/edges incrementalmente a partir de FlowEventMessages */
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

    // Se as mensagens foram limpas, resetar estado
    if (messages.length === 0 && state.processedCount > 0) {
      stateRef.current = createGraphState()
      setResult({ nodes: [], edges: [] })
      return
    }

    // Se o array de mensagens encolheu (clear parcial), rebuild
    if (messages.length < state.processedCount) {
      stateRef.current = createGraphState()
      stateRef.current.processedCount = 0
    }

    // Processar apenas mensagens novas
    const startIdx = stateRef.current.processedCount
    if (startIdx >= messages.length) return

    let addedNewNodes = false
    for (let i = startIdx; i < messages.length; i++) {
      const added = processMessage(stateRef.current, messages[i])
      if (added) addedNewNodes = true
    }
    stateRef.current.processedCount = messages.length

    // Só recalcular layout quando novos nós foram adicionados
    if (addedNewNodes) {
      const { nodes: layoutNodes, edges: layoutEdges } = applyDagreLayout(
        stateRef.current.nodes,
        stateRef.current.edges,
      )
      // Atualizar referências no state
      stateRef.current.nodes = layoutNodes
      stateRef.current.edges = layoutEdges
      setResult({ nodes: [...layoutNodes], edges: [...layoutEdges] })
    } else {
      // Mesmo sem novos nós, atualizar para refletir data changes (content merge, status)
      setResult({ nodes: [...stateRef.current.nodes], edges: [...stateRef.current.edges] })
    }
  }, [messages])

  return result
}
