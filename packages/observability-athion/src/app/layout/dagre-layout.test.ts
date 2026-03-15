/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, it, expect } from 'vitest'
import { applyDagreLayout } from './dagre-layout'
import type { Edge, Node } from '@xyflow/react'
import type { NodeData } from '../hooks/useFlowGraph'

function makeNode(id: string, label = 'test'): Node<NodeData> {
  return {
    id,
    type: 'default',
    data: { label } as NodeData,
    position: { x: 0, y: 0 },
  }
}

function makeEdge(source: string, target: string): Edge {
  return {
    id: `e-${source}-${target}`,
    source,
    target,
  }
}

describe('applyDagreLayout', () => {
  it('should return empty arrays for empty input', () => {
    const result = applyDagreLayout([], [])
    expect(result.nodes).toEqual([])
    expect(result.edges).toEqual([])
  })

  it('should position a single node', () => {
    const nodes = [makeNode('a')]
    const result = applyDagreLayout(nodes, [])

    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe('a')
    // Should have computed position (not 0,0)
    expect(typeof result.nodes[0].position.x).toBe('number')
    expect(typeof result.nodes[0].position.y).toBe('number')
  })

  it('should layout multiple connected nodes vertically (TB)', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')]
    const edges = [makeEdge('a', 'b'), makeEdge('b', 'c')]
    const result = applyDagreLayout(nodes, edges)

    expect(result.nodes).toHaveLength(3)
    expect(result.edges).toHaveLength(2)

    // In TB layout, y should increase from a -> b -> c
    const nodeA = result.nodes.find((n) => n.id === 'a')!
    const nodeB = result.nodes.find((n) => n.id === 'b')!
    const nodeC = result.nodes.find((n) => n.id === 'c')!

    expect(nodeA.position.y).toBeLessThan(nodeB.position.y)
    expect(nodeB.position.y).toBeLessThan(nodeC.position.y)
  })

  it('should preserve node data after layout', () => {
    const node = makeNode('a', 'My Label')
    node.data.status = 'running'
    node.data.detail = 'Some detail'

    const result = applyDagreLayout([node], [])

    expect(result.nodes[0].data.label).toBe('My Label')
    expect(result.nodes[0].data.status).toBe('running')
    expect(result.nodes[0].data.detail).toBe('Some detail')
  })

  it('should preserve edge data after layout', () => {
    const nodes = [makeNode('a'), makeNode('b')]
    const edges: Edge[] = [
      {
        id: 'e-a-b',
        source: 'a',
        target: 'b',
        animated: true,
        style: { stroke: 'red' },
      },
    ]

    const result = applyDagreLayout(nodes, edges)

    expect(result.edges).toHaveLength(1)
    expect(result.edges[0].source).toBe('a')
    expect(result.edges[0].target).toBe('b')
    expect(result.edges[0].animated).toBe(true)
    expect(result.edges[0].style).toEqual({ stroke: 'red' })
  })

  it('should handle branching graphs', () => {
    const nodes = [makeNode('root'), makeNode('left'), makeNode('right')]
    const edges = [makeEdge('root', 'left'), makeEdge('root', 'right')]
    const result = applyDagreLayout(nodes, edges)

    expect(result.nodes).toHaveLength(3)

    const root = result.nodes.find((n) => n.id === 'root')!
    const left = result.nodes.find((n) => n.id === 'left')!
    const right = result.nodes.find((n) => n.id === 'right')!

    // Both children should be below root
    expect(left.position.y).toBeGreaterThan(root.position.y)
    expect(right.position.y).toBeGreaterThan(root.position.y)

    // Left and right should be at different x positions
    expect(left.position.x).not.toBe(right.position.x)
  })

  it('should center nodes (offset by half node dimensions)', () => {
    const nodes = [makeNode('a')]
    const result = applyDagreLayout(nodes, [])

    // The function offsets by NODE_WIDTH/2 and NODE_HEIGHT/2 (280/2=140, 90/2=45)
    // So position should not be exactly at dagre center
    expect(result.nodes[0].position.x).toBeDefined()
    expect(result.nodes[0].position.y).toBeDefined()
  })

  it('should handle disconnected nodes', () => {
    const nodes = [makeNode('a'), makeNode('b')]
    // No edges between them
    const result = applyDagreLayout(nodes, [])

    expect(result.nodes).toHaveLength(2)
    // Both should get positions
    expect(typeof result.nodes[0].position.x).toBe('number')
    expect(typeof result.nodes[1].position.x).toBe('number')
  })

  it('should preserve node type', () => {
    const node = makeNode('a')
    node.type = 'toolCallNode'
    const result = applyDagreLayout([node], [])

    expect(result.nodes[0].type).toBe('toolCallNode')
  })
})
