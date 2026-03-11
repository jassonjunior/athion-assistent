import dagre from 'dagre'
import type { Edge, Node } from '@xyflow/react'
import type { NodeData } from '../hooks/useFlowGraph'

const NODE_WIDTH = 280
const NODE_HEIGHT = 90

export function applyDagreLayout(
  nodes: Node<NodeData>[],
  edges: Edge[],
): { nodes: Node<NodeData>[]; edges: Edge[] } {
  if (nodes.length === 0) return { nodes, edges }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 30, ranksep: 50 })

  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  const positionedNodes = nodes.map((node) => {
    const pos = g.node(node.id)
    if (!pos) return node
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
    }
  })

  return { nodes: positionedNodes, edges }
}
