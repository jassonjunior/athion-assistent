import { useMemo } from 'react'
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

/** Formata timestamp relativo ao inicio do fluxo */
function relativeTime(ts: number, startTs: number): string {
  const diff = (ts - startTs) / 1000
  return `+${diff.toFixed(1)}s`
}

/** Constroi grafo de nodes/edges a partir de FlowEventMessages (modo live) */
export function useFlowGraphLive(messages: FlowEventMessage[]): {
  nodes: FlowNode[]
  edges: Edge[]
} {
  return useMemo(() => {
    const nodes: FlowNode[] = []
    const edges: Edge[] = []
    let lastNodeId: string | null = null
    let contentNodeId: string | null = null
    let subContentNodeId: string | null = null
    const startTs = messages[0]?.timestamp ?? Date.now()

    // Track parent→last-child para linking de subagentes
    const parentLastChild = new Map<string, string>()

    function addNode(
      id: string,
      type: string,
      label: string,
      data: Partial<NodeData> = {},
      parentId?: string,
    ): void {
      const isSubAgent = !!parentId
      nodes.push({
        id,
        type,
        data: { label, isSubAgent, ...data } as NodeData,
        position: { x: 0, y: 0 },
      })

      // Determinar source: se tem parentId, liga ao ultimo no do parent
      const sourceId = parentId ? (parentLastChild.get(parentId) ?? lastNodeId) : lastNodeId
      if (sourceId) {
        edges.push({
          id: `e-${sourceId}-${id}`,
          source: sourceId,
          target: id,
          animated: data.status === 'running',
          style: isSubAgent ? { stroke: '#a78bfa', strokeDasharray: '5,5' } : undefined,
        })
      }

      if (parentId) {
        parentLastChild.set(parentId, id)
      }
      lastNodeId = id
    }

    for (const msg of messages) {
      const nodeType = TYPE_TO_NODE[msg.type]
      if (!nodeType) continue

      const ts = relativeTime(msg.timestamp, startTs)
      const d = msg.data

      switch (msg.type) {
        case 'user_message':
          addNode(msg.id, nodeType, 'User Message', {
            detail: d.content as string,
          })
          break

        case 'system_prompt':
          addNode(msg.id, nodeType, 'System Prompt', {
            detail: `${d.toolCount} tools, ${d.agentCount} agents (${d.length} chars)`,
          })
          break

        case 'llm_content':
          if (!contentNodeId) {
            contentNodeId = msg.id
            addNode(msg.id, nodeType, `LLM Response ${ts}`, {
              detail: d.content as string,
              status: 'running',
            })
          } else {
            const node = nodes.find((n) => n.id === contentNodeId)
            if (node) {
              node.data.detail = ((node.data.detail as string) || '') + (d.content as string)
            }
          }
          break

        case 'tool_call':
          contentNodeId = null
          addNode(msg.id, nodeType, `Tool: ${d.name} ${ts}`, {
            args: d.args,
            status: 'running',
          })
          break

        case 'tool_result': {
          const success = d.success as boolean
          const tcNode = [...nodes]
            .reverse()
            .find((n) => n.type === 'toolCallNode' && n.data.status === 'running')
          if (tcNode) {
            tcNode.data.status = success ? 'success' : 'error'
            tcNode.data.preview = `${d.name}: ${success ? 'OK' : 'FAIL'}`
          }
          break
        }

        case 'subagent_start':
          subContentNodeId = null
          addNode(
            msg.id,
            nodeType,
            `Agent: ${d.agentName} ${ts}`,
            { agentName: d.agentName as string, status: 'running' },
            msg.parentId,
          )
          break

        case 'subagent_content':
          if (!subContentNodeId) {
            subContentNodeId = msg.id
            addNode(
              msg.id,
              nodeType,
              `Agent Response ${ts}`,
              { detail: (d.content as string) ?? (d.text as string), status: 'running' },
              msg.parentId,
            )
          } else {
            const node = nodes.find((n) => n.id === subContentNodeId)
            if (node) {
              const text = (d.content as string) ?? (d.text as string) ?? ''
              node.data.detail = ((node.data.detail as string) || '') + text
            }
          }
          break

        case 'subagent_tool_call':
          subContentNodeId = null
          addNode(
            msg.id,
            nodeType,
            `Tool: ${d.toolName ?? d.name} ${ts}`,
            { args: d.args ?? d.input, status: 'running' },
            msg.parentId,
          )
          break

        case 'subagent_tool_result': {
          const subSuccess = (d.success as boolean) ?? true
          const subTcNode = [...nodes]
            .reverse()
            .find((n) => n.type === 'toolCallNode' && n.data.status === 'running')
          if (subTcNode) {
            subTcNode.data.status = subSuccess ? 'success' : 'error'
            subTcNode.data.preview = String(d.toolName ?? d.name ?? 'result')
          }
          break
        }

        case 'subagent_continuation':
          addNode(
            msg.id,
            nodeType,
            `Continuation ${ts}`,
            { detail: `Index: ${d.continuationIndex}` },
            msg.parentId,
          )
          break

        case 'subagent_complete': {
          subContentNodeId = null
          const agentNode = [...nodes]
            .reverse()
            .find((n) => n.type === 'subAgentNode' && n.data.status === 'running')
          if (agentNode) agentNode.data.status = 'success'
          addNode(
            msg.id,
            'completeNode',
            `Agent Complete ${ts}`,
            { status: 'success', preview: String(d.agentName ?? '') },
            msg.parentId,
          )
          break
        }

        case 'model_loading':
          addNode(msg.id, nodeType, `Loading: ${d.modelName} ${ts}`, {
            status: 'running',
          })
          break

        case 'model_ready': {
          const loadingNode = [...nodes]
            .reverse()
            .find((n) => n.data.status === 'running' && n.type === 'setupNode')
          if (loadingNode) loadingNode.data.status = 'success'
          break
        }

        case 'finish':
          contentNodeId = null
          addNode(msg.id, nodeType, `Finish ${ts}`, {
            detail: `Input: ${d.promptTokens} | Output: ${d.completionTokens} | Total: ${d.totalTokens}`,
            status: 'success',
          })
          break

        case 'error':
          addNode(msg.id, nodeType, `Error ${ts}`, {
            detail: (d.message as string) ?? 'Unknown error',
            status: 'error',
          })
          break
      }
    }

    const { nodes: layoutNodes, edges: layoutEdges } = applyDagreLayout(nodes, edges)
    return { nodes: layoutNodes, edges: layoutEdges }
  }, [messages])
}
