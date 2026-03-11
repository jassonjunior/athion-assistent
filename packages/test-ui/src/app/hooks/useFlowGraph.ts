import { useMemo } from 'react'
import type { Edge, Node } from '@xyflow/react'
import type { TokenSnapshot, WsServerMessage } from '../../server/protocol'
import { applyDagreLayout } from '../layout/dagre-layout'

export type NodeData = {
  label: string
  detail?: string
  tokens?: TokenSnapshot
  status?: 'running' | 'success' | 'error'
  args?: unknown
  preview?: string
  agentName?: string
  isSubAgent?: boolean
  [key: string]: unknown
}

type FlowNode = Node<NodeData>

/** Constrói o grafo de nodes/edges a partir dos eventos WS — layout flat (sem child nodes) */
export function useFlowGraph(messages: WsServerMessage[]): {
  nodes: FlowNode[]
  edges: Edge[]
} {
  return useMemo(() => {
    const nodes: FlowNode[] = []
    const edges: Edge[] = []
    let lastNodeId: string | null = null
    let contentNodeId: string | null = null
    let subContentNodeId: string | null = null
    let inSubAgent = false

    function addNode(id: string, type: string, label: string, data: Partial<NodeData> = {}): void {
      nodes.push({
        id,
        type,
        data: { label, isSubAgent: inSubAgent, ...data } as NodeData,
        position: { x: 0, y: 0 },
      })

      if (lastNodeId) {
        edges.push({
          id: `e-${lastNodeId}-${id}`,
          source: lastNodeId,
          target: id,
          animated: data.status === 'running',
          style: inSubAgent ? { stroke: '#a78bfa', strokeDasharray: '5,5' } : undefined,
        })
      }

      lastNodeId = id
    }

    let nodeCounter = 0
    function nextId(prefix: string): string {
      return `${prefix}-${nodeCounter++}`
    }

    for (const msg of messages) {
      switch (msg.type) {
        case 'test:started':
          addNode(nextId('start'), 'startNode', `Test: ${msg.testName}`, {
            status: 'running',
          })
          break

        case 'setup:tools':
          addNode(nextId('setup'), 'setupNode', 'Setup', {
            detail: `Tools: ${msg.tools.join(', ')}`,
          })
          break

        case 'setup:agents':
          break

        case 'orch:user_message':
          addNode(nextId('user'), 'userMessageNode', 'User Message', {
            detail: msg.content,
            tokens: msg.tokens,
          })
          break

        case 'orch:system_prompt':
          addNode(nextId('sys'), 'systemPromptNode', 'System Prompt', {
            detail: msg.preview,
            tokens: msg.tokens,
          })
          break

        case 'orch:content':
          if (!contentNodeId) {
            contentNodeId = nextId('llm')
            addNode(contentNodeId, 'llmResponseNode', 'LLM Response', {
              detail: msg.content,
              tokens: msg.tokens,
              status: 'running',
            })
          } else {
            const node = nodes.find((n) => n.id === contentNodeId)
            if (node) {
              node.data.detail = ((node.data.detail as string) || '') + msg.content
              node.data.tokens = msg.tokens
            }
          }
          break

        case 'orch:tool_call':
          contentNodeId = null
          addNode(nextId('tc'), 'toolCallNode', `Tool: ${msg.name}`, {
            args: msg.args,
            tokens: msg.tokens,
            status: 'running',
          })
          break

        case 'orch:tool_result': {
          // Atualizar o tool_call node com o resultado (input + output no mesmo node)
          const tcNode = [...nodes]
            .reverse()
            .find((n) => n.type === 'toolCallNode' && n.data.status === 'running')
          if (tcNode) {
            tcNode.data.status = msg.success ? 'success' : 'error'
            tcNode.data.preview = msg.preview
            tcNode.data.tokens = msg.tokens
          }
          break
        }

        case 'orch:subagent_start':
          inSubAgent = true
          subContentNodeId = null
          addNode(nextId('agent'), 'subAgentNode', `Agent: ${msg.agentName}`, {
            agentName: msg.agentName,
            tokens: msg.tokens,
            status: 'running',
          })
          break

        case 'sub:start':
          addNode(nextId('sub-start'), 'subStartNode', `Task: ${msg.description.slice(0, 80)}`, {
            detail: msg.description,
            tokens: msg.tokens,
          })
          break

        case 'sub:tool_call':
          subContentNodeId = null
          addNode(nextId('sub-tc'), 'toolCallNode', `Tool: ${msg.toolName}`, {
            args: msg.args,
            tokens: msg.tokens,
            status: 'running',
          })
          break

        case 'sub:tool_result': {
          // Atualizar o tool_call node com o resultado (input + output no mesmo node)
          const subTcNode = [...nodes]
            .reverse()
            .find((n) => n.type === 'toolCallNode' && n.data.status === 'running')
          if (subTcNode) {
            subTcNode.data.status = msg.success ? 'success' : 'error'
            subTcNode.data.preview = msg.preview
            subTcNode.data.tokens = msg.tokens
          }
          break
        }

        case 'sub:content':
          if (!subContentNodeId) {
            subContentNodeId = nextId('sub-content')
            addNode(subContentNodeId, 'llmResponseNode', 'Agent Response', {
              detail: msg.content,
              tokens: msg.tokens,
              status: 'running',
            })
          } else {
            const node = nodes.find((n) => n.id === subContentNodeId)
            if (node) {
              node.data.detail = ((node.data.detail as string) || '') + msg.content
              node.data.tokens = msg.tokens
            }
          }
          break

        case 'sub:continuation':
          addNode(
            nextId('cont'),
            'continuationNode',
            `Continuation #${msg.continuationIndex + 1}`,
            {
              detail: `Accumulated: ${msg.accumulatedCount} results`,
              tokens: msg.tokens,
            },
          )
          break

        case 'sub:complete':
          subContentNodeId = null
          addNode(nextId('sub-done'), 'completeNode', 'Agent Complete', {
            preview: msg.resultPreview,
            tokens: msg.tokens,
            status: 'success',
          })
          break

        case 'sub:error':
          addNode(nextId('sub-err'), 'errorNode', 'Agent Error', {
            detail: msg.message,
            tokens: msg.tokens,
            status: 'error',
          })
          break

        case 'orch:subagent_complete': {
          inSubAgent = false
          // Marcar o agent node como completo
          const agentNode = [...nodes]
            .reverse()
            .find((n) => n.type === 'subAgentNode' && n.data.status === 'running')
          if (agentNode) agentNode.data.status = 'success'
          break
        }

        case 'orch:finish':
          contentNodeId = null
          addNode(nextId('finish'), 'finishNode', 'Finish', {
            detail: `Input: ${msg.promptTokens} | Output: ${msg.completionTokens} | Total: ${msg.totalTokens}`,
            tokens: msg.tokens,
            status: 'success',
          })
          break

        case 'orch:error':
          addNode(nextId('err'), 'errorNode', 'Error', {
            detail: msg.message,
            tokens: msg.tokens,
            status: 'error',
          })
          break

        case 'test:finished': {
          const startNode = nodes.find((n) => n.type === 'startNode')
          if (startNode) startNode.data.status = msg.passed ? 'success' : 'error'
          break
        }
      }
    }

    const { nodes: layoutNodes, edges: layoutEdges } = applyDagreLayout(nodes, edges)
    return { nodes: layoutNodes, edges: layoutEdges }
  }, [messages])
}
