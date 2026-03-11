import type { NodeTypes } from '@xyflow/react'
import { BaseNode } from './BaseNode'

/** Configuração de cada tipo de node */
const nodeConfigs = {
  startNode: { icon: '▶', color: '#3b82f6' },
  setupNode: { icon: '⚙', color: '#6b7280' },
  userMessageNode: { icon: '👤', color: '#8b5cf6' },
  systemPromptNode: { icon: '📋', color: '#6b7280' },
  llmResponseNode: { icon: '🤖', color: '#06b6d4' },
  toolCallNode: { icon: '🔧', color: '#f59e0b' },
  toolResultNode: { icon: '📦', color: '#10b981' },
  subAgentNode: { icon: '🤖', color: '#8b5cf6' },
  subStartNode: { icon: '📝', color: '#a78bfa' },
  continuationNode: { icon: '🔄', color: '#f97316' },
  completeNode: { icon: '✅', color: '#10b981' },
  finishNode: { icon: '🏁', color: '#3b82f6' },
  errorNode: { icon: '❌', color: '#ef4444' },
} as const

/** Cria componentes de node para cada tipo */
function createNodeComponent(config: { icon: string; color: string }) {
  return function NodeComponent(props: { data: import('../hooks/useFlowGraph').NodeData }) {
    return BaseNode(config, props)
  }
}

export const nodeTypes: NodeTypes = Object.fromEntries(
  Object.entries(nodeConfigs).map(([key, config]) => [key, createNodeComponent(config)]),
)
