import { describe, expect, it } from 'vitest'
import { DependencyGraph } from './dependency-graph'

describe('DependencyGraph', () => {
  describe('addFile / getDirectDependencies', () => {
    it('registra dependências de um arquivo', () => {
      const graph = new DependencyGraph()
      graph.addFile('/src/a.ts', ['/src/b.ts', '/src/c.ts'])

      expect(graph.getDirectDependencies('/src/a.ts')).toEqual(['/src/b.ts', '/src/c.ts'])
    })

    it('retorna vazio para arquivo sem dependências', () => {
      const graph = new DependencyGraph()
      graph.addFile('/src/leaf.ts', [])

      expect(graph.getDirectDependencies('/src/leaf.ts')).toEqual([])
    })

    it('retorna vazio para arquivo não registrado', () => {
      const graph = new DependencyGraph()
      expect(graph.getDirectDependencies('/nonexistent.ts')).toEqual([])
    })
  })

  describe('getDirectDependents', () => {
    it('A importa B → B tem dependente A', () => {
      const graph = new DependencyGraph()
      graph.addFile('/src/a.ts', ['/src/b.ts'])

      expect(graph.getDirectDependents('/src/b.ts')).toEqual(['/src/a.ts'])
    })

    it('múltiplos arquivos importam B → B tem múltiplos dependentes', () => {
      const graph = new DependencyGraph()
      graph.addFile('/src/a.ts', ['/src/b.ts'])
      graph.addFile('/src/c.ts', ['/src/b.ts'])

      const deps = graph.getDirectDependents('/src/b.ts').sort()
      expect(deps).toEqual(['/src/a.ts', '/src/c.ts'])
    })

    it('retorna vazio para arquivo sem dependentes', () => {
      const graph = new DependencyGraph()
      graph.addFile('/src/a.ts', ['/src/b.ts'])

      expect(graph.getDirectDependents('/src/a.ts')).toEqual([])
    })
  })

  describe('getTransitiveDependents', () => {
    it('A → B → C → getTransitiveDependents(C) retorna [B, A]', () => {
      const graph = new DependencyGraph()
      graph.addFile('/src/a.ts', ['/src/b.ts'])
      graph.addFile('/src/b.ts', ['/src/c.ts'])

      const deps = graph.getTransitiveDependents('/src/c.ts').sort()
      expect(deps).toEqual(['/src/a.ts', '/src/b.ts'])
    })

    it('grafo vazio → 0 dependentes transitivos', () => {
      const graph = new DependencyGraph()
      expect(graph.getTransitiveDependents('/src/x.ts')).toEqual([])
    })

    it('ciclo A → B → A → não entra em loop infinito', () => {
      const graph = new DependencyGraph()
      graph.addFile('/src/a.ts', ['/src/b.ts'])
      graph.addFile('/src/b.ts', ['/src/a.ts'])

      const depsA = graph.getTransitiveDependents('/src/a.ts')
      expect(depsA).toEqual(['/src/b.ts'])

      const depsB = graph.getTransitiveDependents('/src/b.ts')
      expect(depsB).toEqual(['/src/a.ts'])
    })

    it('respeita maxDepth', () => {
      const graph = new DependencyGraph()
      // Cadeia longa: e → d → c → b → a
      graph.addFile('/a.ts', ['/b.ts'])
      graph.addFile('/b.ts', ['/c.ts'])
      graph.addFile('/c.ts', ['/d.ts'])
      graph.addFile('/d.ts', ['/e.ts'])

      // Com maxDepth=2, partindo de /e.ts, encontra d e c apenas
      const deps = graph.getTransitiveDependents('/e.ts', 2)
      expect(deps).toContain('/d.ts')
      expect(deps).toContain('/c.ts')
      expect(deps).not.toContain('/a.ts')
    })

    it('funciona com grafo diamante A → B, A → C, B → D, C → D', () => {
      const graph = new DependencyGraph()
      graph.addFile('/a.ts', ['/b.ts', '/c.ts'])
      graph.addFile('/b.ts', ['/d.ts'])
      graph.addFile('/c.ts', ['/d.ts'])

      const deps = graph.getTransitiveDependents('/d.ts').sort()
      expect(deps).toEqual(['/a.ts', '/b.ts', '/c.ts'])
    })
  })

  describe('removeFile', () => {
    it('remove do grafo forward e reverse', () => {
      const graph = new DependencyGraph()
      graph.addFile('/a.ts', ['/b.ts'])
      graph.addFile('/c.ts', ['/b.ts'])

      graph.removeFile('/a.ts')

      expect(graph.getDirectDependencies('/a.ts')).toEqual([])
      expect(graph.getDirectDependents('/b.ts')).toEqual(['/c.ts'])
    })

    it('é safe para arquivo não registrado', () => {
      const graph = new DependencyGraph()
      expect(() => graph.removeFile('/nonexistent.ts')).not.toThrow()
    })
  })

  describe('getImpactAnalysis', () => {
    it('classifica risk low para 0-2 dependentes', () => {
      const graph = new DependencyGraph()
      graph.addFile('/a.ts', ['/b.ts'])

      const analysis = graph.getImpactAnalysis('/b.ts')
      expect(analysis.riskLevel).toBe('low')
      expect(analysis.directDependents).toEqual(['/a.ts'])
    })

    it('classifica risk medium para 3-10 dependentes', () => {
      const graph = new DependencyGraph()
      // 5 arquivos dependem de /core.ts
      for (let i = 0; i < 5; i++) {
        graph.addFile(`/f${i}.ts`, ['/core.ts'])
      }

      const analysis = graph.getImpactAnalysis('/core.ts')
      expect(analysis.riskLevel).toBe('medium')
      expect(analysis.transitiveDependents.length).toBe(5)
    })

    it('classifica risk high para >10 dependentes', () => {
      const graph = new DependencyGraph()
      for (let i = 0; i < 15; i++) {
        graph.addFile(`/f${i}.ts`, ['/utils.ts'])
      }

      const analysis = graph.getImpactAnalysis('/utils.ts')
      expect(analysis.riskLevel).toBe('high')
    })
  })

  describe('getStats', () => {
    it('retorna estatísticas corretas', () => {
      const graph = new DependencyGraph()
      graph.addFile('/a.ts', ['/b.ts', '/c.ts'])
      graph.addFile('/b.ts', ['/c.ts'])

      const stats = graph.getStats()
      expect(stats.totalFiles).toBe(2)
      expect(stats.totalEdges).toBe(3)
      expect(stats.avgDependencies).toBe(1.5)
      expect(stats.maxDependents).toBe(2) // /c.ts tem 2 dependentes
    })

    it('retorna zeros para grafo vazio', () => {
      const graph = new DependencyGraph()
      const stats = graph.getStats()
      expect(stats.totalFiles).toBe(0)
      expect(stats.totalEdges).toBe(0)
      expect(stats.avgDependencies).toBe(0)
      expect(stats.maxDependents).toBe(0)
    })
  })

  describe('clear', () => {
    it('limpa o grafo', () => {
      const graph = new DependencyGraph()
      graph.addFile('/a.ts', ['/b.ts'])

      graph.clear()

      expect(graph.getStats().totalFiles).toBe(0)
      expect(graph.getDirectDependencies('/a.ts')).toEqual([])
      expect(graph.getDirectDependents('/b.ts')).toEqual([])
    })
  })

  describe('re-addFile (atualização)', () => {
    it('atualiza imports de arquivo já registrado', () => {
      const graph = new DependencyGraph()
      graph.addFile('/a.ts', ['/b.ts'])
      graph.addFile('/a.ts', ['/c.ts']) // atualiza imports

      expect(graph.getDirectDependencies('/a.ts')).toEqual(['/c.ts'])
      expect(graph.getDirectDependents('/b.ts')).toEqual([])
      expect(graph.getDirectDependents('/c.ts')).toEqual(['/a.ts'])
    })
  })
})
