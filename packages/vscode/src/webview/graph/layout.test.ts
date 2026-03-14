import { describe, expect, it } from 'vitest'
import { layoutGraph, NODE_WIDTH, NODE_HEIGHT } from './layout'

describe('layoutGraph', () => {
  it('retorna nodes e edges vazios para input vazio', () => {
    const result = layoutGraph([], [])
    expect(result.nodes).toHaveLength(0)
    expect(result.edges).toHaveLength(0)
  })

  it('cria nodes para cada arquivo', () => {
    const files = ['src/a.ts', 'src/b.ts', 'src/c.ts']
    const result = layoutGraph(files, [])
    expect(result.nodes).toHaveLength(3)
    expect(result.nodes.map((n) => n.id)).toEqual(files)
  })

  it('cria edges para cada dependência', () => {
    const files = ['src/a.ts', 'src/b.ts']
    const edges = [{ from: 'src/a.ts', to: 'src/b.ts' }]
    const result = layoutGraph(files, edges)
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0]?.source).toBe('src/a.ts')
    expect(result.edges[0]?.target).toBe('src/b.ts')
  })

  it('posiciona nodes com Dagre (top-to-bottom)', () => {
    const files = ['src/a.ts', 'src/b.ts']
    const edges = [{ from: 'src/a.ts', to: 'src/b.ts' }]
    const result = layoutGraph(files, edges)

    const nodeA = result.nodes.find((n) => n.id === 'src/a.ts')
    const nodeB = result.nodes.find((n) => n.id === 'src/b.ts')
    expect(nodeA).toBeDefined()
    expect(nodeB).toBeDefined()
    // A (parent) should be above B (child) in top-to-bottom layout
    expect(nodeA?.position.y).toBeLessThan(nodeB?.position.y ?? 0)
  })

  it('marca o node focado com estilo diferente', () => {
    const files = ['src/a.ts', 'src/b.ts']
    const result = layoutGraph(files, [], 'src/a.ts')

    const focused = result.nodes.find((n) => n.id === 'src/a.ts')
    const normal = result.nodes.find((n) => n.id === 'src/b.ts')

    const focusedBg = (focused?.style as Record<string, unknown>)?.background as string
    const normalBg = (normal?.style as Record<string, unknown>)?.background as string
    expect(focusedBg).toContain('button-background')
    expect(normalBg).toContain('editor-background')
  })

  it('usa nome do arquivo como label (sem path)', () => {
    const files = ['src/deep/nested/file.ts']
    const result = layoutGraph(files, [])
    const node = result.nodes[0]
    expect((node?.data as { label: string }).label).toBe('file.ts')
  })

  it('define fullPath no data do node', () => {
    const files = ['src/index.ts']
    const result = layoutGraph(files, [])
    const node = result.nodes[0]
    expect((node?.data as { fullPath: string }).fullPath).toBe('src/index.ts')
  })

  it('define dimensões corretas nos nodes', () => {
    const files = ['a.ts']
    const result = layoutGraph(files, [])
    const style = result.nodes[0]?.style as Record<string, unknown>
    expect(style.width).toBe(NODE_WIDTH)
    expect(style.height).toBe(NODE_HEIGHT)
  })

  it('lida com grafo complexo (múltiplos edges)', () => {
    const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts']
    const edges = [
      { from: 'a.ts', to: 'b.ts' },
      { from: 'a.ts', to: 'c.ts' },
      { from: 'b.ts', to: 'd.ts' },
      { from: 'c.ts', to: 'd.ts' },
    ]
    const result = layoutGraph(files, edges)
    expect(result.nodes).toHaveLength(4)
    expect(result.edges).toHaveLength(4)
  })
})
