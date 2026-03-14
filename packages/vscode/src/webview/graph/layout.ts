/**
 * layout
 * Descrição: Lógica de layout do DependencyGraph usando Dagre.
 * Extraído do GraphApp para facilitar testes unitários.
 */

import type { Node, Edge } from '@xyflow/react'
import dagre from 'dagre'

export const NODE_WIDTH = 200
export const NODE_HEIGHT = 40

export interface GraphLayoutResult {
  nodes: Node[]
  edges: Edge[]
}

export function layoutGraph(
  files: string[],
  edges: Array<{ from: string; to: string }>,
  focusFile?: string,
): GraphLayoutResult {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 })

  for (const file of files) {
    g.setNode(file, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  const flowEdges: Edge[] = edges.map((edge) => {
    g.setEdge(edge.from, edge.to)
    return {
      id: `${edge.from}->${edge.to}`,
      source: edge.from,
      target: edge.to,
      animated: false,
      style: { stroke: 'var(--vscode-foreground, #888)', strokeWidth: 1.5 },
    }
  })

  dagre.layout(g)

  const flowNodes: Node[] = files.map((file) => {
    const pos = g.node(file)
    const isFocus = file === focusFile
    return {
      id: file,
      position: { x: (pos?.x ?? 0) - NODE_WIDTH / 2, y: (pos?.y ?? 0) - NODE_HEIGHT / 2 },
      data: { label: file.split('/').pop() ?? file, fullPath: file },
      style: nodeStyle(isFocus),
    }
  })

  return { nodes: flowNodes, edges: flowEdges }
}

function nodeStyle(isFocus: boolean): Record<string, unknown> {
  return {
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    background: isFocus
      ? 'var(--vscode-button-background, #0078d4)'
      : 'var(--vscode-editor-background, #1e1e1e)',
    color: isFocus ? 'var(--vscode-button-foreground, #fff)' : 'var(--vscode-foreground, #ccc)',
    border: `1px solid ${isFocus ? 'var(--vscode-focusBorder, #007fd4)' : 'var(--vscode-panel-border, #444)'}`,
    borderRadius: '6px',
    fontSize: '11px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: '4px 8px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}
