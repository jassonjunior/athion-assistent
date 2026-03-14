/** DependencyGraph
 * Descrição: Grafo dirigido de dependências entre arquivos, construído a partir
 * dos imports extraídos pelo tree-sitter. Usado para impact analysis — dado
 * um arquivo modificado, identifica todos os arquivos que podem ser afetados.
 * Implementação: Map<string, Set<string>> para dependencies e dependents (reverso).
 */

/** ImpactResult
 * Descrição: Resultado da análise de impacto de uma alteração em um arquivo
 */
export interface ImpactResult {
  /** directDependents
   * Descrição: Arquivos que importam diretamente o arquivo alvo
   */
  directDependents: string[]
  /** transitiveDependents
   * Descrição: Todos os arquivos alcançáveis via cadeia de importações
   */
  transitiveDependents: string[]
  /** riskLevel
   * Descrição: Nível de risco baseado na quantidade de dependentes transitivos
   * low (0-2), medium (3-10), high (>10)
   */
  riskLevel: 'low' | 'medium' | 'high'
}

/** GraphStats
 * Descrição: Estatísticas do grafo de dependências
 */
export interface GraphStats {
  /** totalFiles
   * Descrição: Total de arquivos no grafo
   */
  totalFiles: number
  /** totalEdges
   * Descrição: Total de arestas (relações de importação)
   */
  totalEdges: number
  /** avgDependencies
   * Descrição: Média de dependências por arquivo
   */
  avgDependencies: number
  /** maxDependents
   * Descrição: Maior número de dependentes diretos de um arquivo
   */
  maxDependents: number
}

/** DependencyGraph
 * Descrição: Grafo dirigido de dependências entre arquivos do workspace.
 * Mantém dois mapas — forward (file → imports) e reverse (file → importado por).
 * BFS com limit de profundidade para análise de impacto transitivo.
 */
export class DependencyGraph {
  /** dependencies
   * Descrição: Mapa forward — arquivo → set de arquivos que ele importa
   */
  private dependencies: Map<string, Set<string>> = new Map()

  /** dependents
   * Descrição: Mapa reverso — arquivo → set de arquivos que importam ele
   */
  private dependents: Map<string, Set<string>> = new Map()

  /** addFile
   * Descrição: Adiciona um arquivo e suas importações ao grafo.
   * Atualiza ambos os mapas (forward e reverse). Se o arquivo já existia,
   * limpa apenas as referências forward antes de atualizar.
   * @param filePath - Caminho absoluto do arquivo
   * @param imports - Array de caminhos dos arquivos importados
   */
  addFile(filePath: string, imports: string[]): void {
    // Limpa referências forward antigas (sem tocar nos dependents deste arquivo)
    this.clearForwardRefs(filePath)

    const importSet = new Set(imports)
    this.dependencies.set(filePath, importSet)

    // Atualiza grafo reverso
    for (const imp of imports) {
      if (!this.dependents.has(imp)) {
        this.dependents.set(imp, new Set())
      }
      this.dependents.get(imp)?.add(filePath)
    }
  }

  /** removeFile
   * Descrição: Remove um arquivo completamente do grafo (forward e reverse)
   * @param filePath - Caminho absoluto do arquivo a remover
   */
  removeFile(filePath: string): void {
    // Limpa referências forward (este arquivo → imports)
    this.clearForwardRefs(filePath)

    // Limpa referências reverse (quem importa este arquivo)
    const deps = this.dependents.get(filePath)
    if (deps) {
      for (const dep of deps) {
        this.dependencies.get(dep)?.delete(filePath)
      }
      this.dependents.delete(filePath)
    }
  }

  /** clearForwardRefs
   * Descrição: Remove apenas as referências forward de um arquivo
   * (limpa os imports antigos sem afetar quem importa este arquivo)
   * @param filePath - Caminho absoluto do arquivo
   */
  private clearForwardRefs(filePath: string): void {
    const oldImports = this.dependencies.get(filePath)
    if (oldImports) {
      for (const imp of oldImports) {
        this.dependents.get(imp)?.delete(filePath)
        if (this.dependents.get(imp)?.size === 0) {
          this.dependents.delete(imp)
        }
      }
    }
    this.dependencies.delete(filePath)
  }

  /** getDirectDependencies
   * Descrição: Retorna os arquivos que o arquivo dado importa diretamente
   * @param filePath - Caminho absoluto do arquivo
   * @returns Array de caminhos importados
   */
  getDirectDependencies(filePath: string): string[] {
    return Array.from(this.dependencies.get(filePath) ?? [])
  }

  /** getDirectDependents
   * Descrição: Retorna os arquivos que importam diretamente o arquivo dado
   * @param filePath - Caminho absoluto do arquivo
   * @returns Array de caminhos que importam este arquivo
   */
  getDirectDependents(filePath: string): string[] {
    return Array.from(this.dependents.get(filePath) ?? [])
  }

  /** getTransitiveDependents
   * Descrição: Retorna todos os arquivos alcançáveis via cadeia de importações
   * a partir do arquivo dado. Usa BFS com limit de profundidade para evitar
   * traversal infinito em grafos cíclicos.
   * @param filePath - Caminho absoluto do arquivo raiz
   * @param maxDepth - Profundidade máxima do BFS (default: 5)
   * @returns Array de caminhos alcançáveis (excluindo o próprio arquivo)
   */
  getTransitiveDependents(filePath: string, maxDepth = 5): string[] {
    const visited = new Set<string>()
    const queue: Array<{ path: string; depth: number }> = [{ path: filePath, depth: 0 }]
    visited.add(filePath)

    while (queue.length > 0) {
      const current = queue.shift()
      if (!current || current.depth >= maxDepth) continue

      const deps = this.dependents.get(current.path)
      if (!deps) continue

      for (const dep of deps) {
        if (!visited.has(dep)) {
          visited.add(dep)
          queue.push({ path: dep, depth: current.depth + 1 })
        }
      }
    }

    // Exclui o próprio arquivo do resultado
    visited.delete(filePath)
    return Array.from(visited)
  }

  /** getImpactAnalysis
   * Descrição: Analisa o impacto de uma mudança no arquivo dado.
   * Calcula dependentes diretos e transitivos, e classifica o risco.
   * @param filePath - Caminho absoluto do arquivo alterado
   * @returns Resultado da análise com dependentes e nível de risco
   */
  getImpactAnalysis(filePath: string): ImpactResult {
    const directDependents = this.getDirectDependents(filePath)
    const transitiveDependents = this.getTransitiveDependents(filePath)
    const count = transitiveDependents.length

    let riskLevel: 'low' | 'medium' | 'high'
    if (count <= 2) riskLevel = 'low'
    else if (count <= 10) riskLevel = 'medium'
    else riskLevel = 'high'

    return { directDependents, transitiveDependents, riskLevel }
  }

  /** getStats
   * Descrição: Retorna estatísticas do grafo de dependências
   * @returns Objeto com totais de arquivos, arestas, média e máximo de dependentes
   */
  getStats(): GraphStats {
    let totalEdges = 0
    let maxDependents = 0

    for (const deps of this.dependencies.values()) {
      totalEdges += deps.size
    }

    for (const deps of this.dependents.values()) {
      if (deps.size > maxDependents) maxDependents = deps.size
    }

    const totalFiles = this.dependencies.size
    return {
      totalFiles,
      totalEdges,
      avgDependencies: totalFiles > 0 ? totalEdges / totalFiles : 0,
      maxDependents,
    }
  }

  /** toJSON
   * Descrição: Serializa o grafo para JSON persistível/exportável.
   * Opcionalmente foca em um subgrafo a partir de um arquivo específico.
   * @param options - Opções de foco (arquivo raiz + profundidade máxima)
   * @returns Objeto SerializedGraph pronto para JSON.stringify
   */
  toJSON(options?: { focus?: string; depth?: number }): SerializedGraph {
    if (options?.focus) {
      return this.subgraphToJSON(options.focus, options.depth ?? 3)
    }

    const files: string[] = []
    const fileSet = new Set<string>()

    // Coleta todos os arquivos (de dependencies e dependents)
    for (const f of this.dependencies.keys()) {
      if (!fileSet.has(f)) {
        fileSet.add(f)
        files.push(f)
      }
    }
    for (const f of this.dependents.keys()) {
      if (!fileSet.has(f)) {
        fileSet.add(f)
        files.push(f)
      }
    }
    files.sort()

    const edges: Array<{ from: string; to: string }> = []
    for (const [file, deps] of this.dependencies) {
      for (const dep of deps) {
        edges.push({ from: file, to: dep })
      }
    }

    return {
      version: 1,
      files,
      edges,
      stats: this.getStats(),
      exportedAt: new Date().toISOString(),
    }
  }

  /** subgraphToJSON
   * Descrição: Extrai subgrafo focado em um arquivo com profundidade limitada (BFS bidirecional).
   * @param focus - Arquivo raiz do subgrafo
   * @param depth - Profundidade máxima do BFS
   * @returns SerializedGraph do subgrafo
   */
  private subgraphToJSON(focus: string, depth: number): SerializedGraph {
    const visited = new Set<string>()
    const queue: Array<{ path: string; d: number }> = [{ path: focus, d: 0 }]
    visited.add(focus)

    while (queue.length > 0) {
      const current = queue.shift()
      if (!current || current.d >= depth) continue

      // Forward: quem este arquivo importa
      const fwd = this.dependencies.get(current.path)
      if (fwd) {
        for (const dep of fwd) {
          if (!visited.has(dep)) {
            visited.add(dep)
            queue.push({ path: dep, d: current.d + 1 })
          }
        }
      }

      // Reverse: quem importa este arquivo
      const rev = this.dependents.get(current.path)
      if (rev) {
        for (const dep of rev) {
          if (!visited.has(dep)) {
            visited.add(dep)
            queue.push({ path: dep, d: current.d + 1 })
          }
        }
      }
    }

    const files = Array.from(visited).sort()
    const edges: Array<{ from: string; to: string }> = []
    for (const file of files) {
      const deps = this.dependencies.get(file)
      if (deps) {
        for (const dep of deps) {
          if (visited.has(dep)) {
            edges.push({ from: file, to: dep })
          }
        }
      }
    }

    const totalEdges = edges.length
    const totalFiles = files.length

    return {
      version: 1,
      files,
      edges,
      stats: {
        totalFiles,
        totalEdges,
        avgDependencies: totalFiles > 0 ? totalEdges / totalFiles : 0,
        maxDependents: 0,
      },
      exportedAt: new Date().toISOString(),
    }
  }

  /** fromJSON
   * Descrição: Reconstrói um DependencyGraph a partir de JSON serializado.
   * @param data - Objeto SerializedGraph (resultado de toJSON)
   * @returns Nova instância de DependencyGraph populada
   */
  static fromJSON(data: SerializedGraph): DependencyGraph {
    const graph = new DependencyGraph()
    // Agrupa edges por source file
    const edgesByFile = new Map<string, string[]>()
    for (const file of data.files) {
      edgesByFile.set(file, [])
    }
    for (const edge of data.edges) {
      let arr = edgesByFile.get(edge.from)
      if (!arr) {
        arr = []
        edgesByFile.set(edge.from, arr)
      }
      arr.push(edge.to)
    }
    for (const [file, imports] of edgesByFile) {
      graph.addFile(file, imports)
    }
    return graph
  }

  /** toMermaid
   * Descrição: Gera diagrama Mermaid do grafo (ou subgrafo focado).
   * @param options - Opções de foco e profundidade
   * @returns String com código Mermaid válido
   */
  toMermaid(options?: { focus?: string; depth?: number }): string {
    const data = this.toJSON(options)
    const lines: string[] = ['graph LR']

    // Cria IDs curtos para nomes de arquivo
    const idMap = new Map<string, string>()
    for (let i = 0; i < data.files.length; i++) {
      const f = data.files[i]
      if (f) idMap.set(f, `N${i}`)
    }

    // Declara nodes com labels curtos (apenas nome do arquivo)
    for (const file of data.files) {
      const id = idMap.get(file)
      if (!id) continue
      const shortName = file.split('/').pop() ?? file
      const isFocus = options?.focus && file === options.focus
      if (isFocus) {
        lines.push(`  ${id}[["${shortName}"]]`)
      } else {
        lines.push(`  ${id}["${shortName}"]`)
      }
    }

    // Declara edges
    for (const edge of data.edges) {
      const fromId = idMap.get(edge.from)
      const toId = idMap.get(edge.to)
      if (fromId && toId) {
        lines.push(`  ${fromId} --> ${toId}`)
      }
    }

    return lines.join('\n')
  }

  /** clear
   * Descrição: Limpa o grafo completamente
   */
  clear(): void {
    this.dependencies.clear()
    this.dependents.clear()
  }
}

/** SerializedGraph
 * Descrição: Formato JSON versionado para persistência/export do DependencyGraph
 */
export interface SerializedGraph {
  version: number
  files: string[]
  edges: Array<{ from: string; to: string }>
  stats: GraphStats
  exportedAt: string
}
