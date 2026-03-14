import { describe, expect, it } from 'vitest'
import {
  formatRepoMeta,
  formatPatterns,
  formatFileSummaries,
  formatSymbols,
  formatImpactAnalysis,
  formatHierarchicalPrompt,
} from './context-formatters'

describe('formatRepoMeta', () => {
  it('formata metadata L0 do repositório', () => {
    const result = formatRepoMeta({
      language: 'TypeScript',
      framework: 'Bun',
      testFramework: 'vitest',
      buildSystem: 'turbo',
      entryPoints: ['src/index.ts', 'src/cli.ts'],
    })

    expect(result).toContain('## Repositório')
    expect(result).toContain('TypeScript')
    expect(result).toContain('Bun')
    expect(result).toContain('vitest')
    expect(result).toContain('src/index.ts')
  })

  it('omite campos não preenchidos', () => {
    const result = formatRepoMeta({ language: 'Python' })
    expect(result).toContain('Python')
    expect(result).not.toContain('Framework')
    expect(result).not.toContain('Build')
  })
})

describe('formatPatterns', () => {
  it('formata padrões L4 com convenções obrigatórias', () => {
    const result = formatPatterns({
      namingFunctions: 'camelCase',
      namingClasses: 'PascalCase',
      antiPatterns: '- Não use any\n- Não use var',
    })

    expect(result).toContain('Convenções do Codebase (OBRIGATÓRIO)')
    expect(result).toContain('camelCase')
    expect(result).toContain('PascalCase')
    expect(result).toContain('NUNCA faça')
    expect(result).toContain('Não use any')
  })

  it('omite seção NUNCA se não há anti-patterns', () => {
    const result = formatPatterns({ namingFunctions: 'camelCase' })
    expect(result).not.toContain('NUNCA')
  })
})

describe('formatFileSummaries', () => {
  it('formata sumários L2 de arquivos', () => {
    const result = formatFileSummaries([
      { filePath: 'src/auth.ts', purpose: 'Autenticação JWT', exports: ['login', 'verify'] },
      { filePath: 'src/db.ts', purpose: 'Conexão com banco', exports: ['connect'] },
    ])

    expect(result).toContain('Arquivos Relevantes')
    expect(result).toContain('src/auth.ts')
    expect(result).toContain('Autenticação JWT')
    expect(result).toContain('login, verify')
  })

  it('retorna string vazia para array vazio', () => {
    expect(formatFileSummaries([])).toBe('')
  })
})

describe('formatSymbols', () => {
  it('formata símbolos L3 agrupados por arquivo', () => {
    const result = formatSymbols([
      {
        filePath: 'src/auth.ts',
        symbolName: 'login',
        chunkType: 'function',
        startLine: 10,
        endLine: 25,
        content: 'function login(user: string) {\n  return token\n}',
      },
      {
        filePath: 'src/auth.ts',
        symbolName: 'verify',
        chunkType: 'function',
        startLine: 30,
        endLine: 40,
        content: 'function verify(token: string) {\n  return decoded\n}',
      },
    ])

    expect(result).toContain('Símbolos Relevantes')
    expect(result).toContain('src/auth.ts')
    expect(result).toContain('login')
    expect(result).toContain('verify')
    expect(result).toContain('function')
  })

  it('retorna string vazia para array vazio', () => {
    expect(formatSymbols([])).toBe('')
  })
})

describe('formatImpactAnalysis', () => {
  it('formata análise de impacto com nível de risco', () => {
    const result = formatImpactAnalysis([
      {
        filePath: 'src/auth.ts',
        impact: {
          directDependents: ['src/api.ts', 'src/middleware.ts'],
          transitiveDependents: ['src/api.ts', 'src/middleware.ts', 'src/app.ts'],
          riskLevel: 'medium',
        },
      },
    ])

    expect(result).toContain('Análise de Impacto')
    expect(result).toContain('src/auth.ts')
    expect(result).toContain('MEDIO')
    expect(result).toContain('3 arquivo(s)')
  })

  it('mostra risco ALTO para high', () => {
    const result = formatImpactAnalysis([
      {
        filePath: 'src/core.ts',
        impact: {
          directDependents: [],
          transitiveDependents: Array.from({ length: 15 }, (_, i) => `file${i}.ts`),
          riskLevel: 'high',
        },
      },
    ])

    expect(result).toContain('ALTO')
  })

  it('retorna string vazia para array vazio', () => {
    expect(formatImpactAnalysis([])).toBe('')
  })
})

describe('formatHierarchicalPrompt', () => {
  it('monta prompt na ordem L0→L4→Impact→L2→L3→Task', () => {
    const result = formatHierarchicalPrompt({
      repoMeta: '## Repositório\n- TypeScript',
      patterns: '## Convenções\n- camelCase',
      impactAnalysis: '## Impacto\n- 3 arquivos',
      fileSummaries: '## Arquivos\n- auth.ts',
      symbols: '## Símbolos\n- login()',
      task: 'Corrija o bug de autenticação',
    })

    const repoIdx = result.indexOf('Repositório')
    const patternsIdx = result.indexOf('Convenções')
    const impactIdx = result.indexOf('Impacto')
    const filesIdx = result.indexOf('Arquivos')
    const symbolsIdx = result.indexOf('Símbolos')
    const taskIdx = result.indexOf('Corrija o bug')

    expect(repoIdx).toBeLessThan(patternsIdx)
    expect(patternsIdx).toBeLessThan(impactIdx)
    expect(impactIdx).toBeLessThan(filesIdx)
    expect(filesIdx).toBeLessThan(symbolsIdx)
    expect(symbolsIdx).toBeLessThan(taskIdx)
  })

  it('inclui instrução de seguir convenções após task', () => {
    const result = formatHierarchicalPrompt({
      task: 'Implemente a feature X',
    })

    expect(result).toContain('Siga EXATAMENTE as convenções')
  })

  it('omite seções vazias', () => {
    const result = formatHierarchicalPrompt({
      repoMeta: '## Repo',
      task: 'Faça algo',
    })

    expect(result).not.toContain('Convenções')
    expect(result).not.toContain('Impacto')
  })
})
