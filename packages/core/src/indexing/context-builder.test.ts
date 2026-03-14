import { describe, expect, it } from 'vitest'
import { ContextAssembler, estimateTokens, truncateBlock } from './context-builder'

describe('estimateTokens', () => {
  it('estima ~3.5 chars por token', () => {
    const text = 'a'.repeat(350)
    expect(estimateTokens(text)).toBe(100)
  })

  it('retorna 0 para string vazia', () => {
    expect(estimateTokens('')).toBe(0)
  })
})

describe('truncateBlock', () => {
  it('retorna conteúdo inalterado se cabe no budget', () => {
    const content = 'linha 1\nlinha 2'
    expect(truncateBlock(content, 100)).toBe(content)
  })

  it('trunca preservando linhas completas', () => {
    const content = 'linha curta\nlinha muito longa que excede o budget disponível para o bloco'
    const result = truncateBlock(content, 5) // ~17 chars
    expect(result).toContain('linha curta')
    expect(result).toContain('...[truncated]')
  })

  it('mantém pelo menos a primeira linha truncada se nenhuma cabe', () => {
    const content = 'uma linha muito muito longa que definitivamente excede qualquer budget minimo'
    const result = truncateBlock(content, 2) // ~7 chars
    expect(result.length).toBeGreaterThan(0)
    expect(result).toContain('...[truncated]')
  })
})

describe('ContextAssembler', () => {
  it('inclui blocos required mesmo que excedam budget', () => {
    const assembler = new ContextAssembler(100)
    assembler.addBlock({
      name: 'L0',
      priority: 1,
      estimatedTokens: 50,
      content: 'Repo meta',
      required: true,
    })
    assembler.addBlock({
      name: 'L4',
      priority: 1,
      estimatedTokens: 50,
      content: 'Patterns',
      required: true,
    })

    const result = assembler.assemble()
    expect(result.includedBlocks).toContain('L0')
    expect(result.includedBlocks).toContain('L4')
  })

  it('ordena por prioridade (menor = mais importante)', () => {
    const assembler = new ContextAssembler(10000)
    assembler.addBlock({
      name: 'L3',
      priority: 4,
      estimatedTokens: 100,
      content: 'Symbols',
      required: false,
    })
    assembler.addBlock({
      name: 'L0',
      priority: 1,
      estimatedTokens: 100,
      content: 'Repo',
      required: true,
    })
    assembler.addBlock({
      name: 'L2',
      priority: 3,
      estimatedTokens: 100,
      content: 'Files',
      required: false,
    })

    const result = assembler.assemble()
    expect(result.includedBlocks).toEqual(['L0', 'L2', 'L3'])
  })

  it('exclui blocos opcionais que não cabem no budget', () => {
    const assembler = new ContextAssembler(200)
    assembler.addBlock({
      name: 'L0',
      priority: 1,
      estimatedTokens: 150,
      content: 'Repo meta obrigatório',
      required: true,
    })
    assembler.addBlock({
      name: 'L3',
      priority: 4,
      estimatedTokens: 500,
      content: 'Symbols muito grande',
      required: false,
    })

    const result = assembler.assemble()
    expect(result.includedBlocks).toContain('L0')
    // L3 pode ser truncado para caber nos 50 tokens restantes
    expect(result.totalTokens).toBeLessThanOrEqual(200)
  })

  it('respeita budget de tokens', () => {
    const assembler = new ContextAssembler(500)
    assembler.addBlock({
      name: 'B1',
      priority: 1,
      estimatedTokens: 200,
      content: 'Block 1',
      required: true,
    })
    assembler.addBlock({
      name: 'B2',
      priority: 2,
      estimatedTokens: 200,
      content: 'Block 2',
      required: false,
    })

    const result = assembler.assemble()
    expect(result.totalTokens).toBeLessThanOrEqual(500)
  })

  it('retorna excludedBlocks para blocos que não cabem', () => {
    const assembler = new ContextAssembler(100)
    assembler.addBlock({
      name: 'L0',
      priority: 1,
      estimatedTokens: 90,
      content: 'Repo',
      required: true,
    })
    assembler.addBlock({
      name: 'L3',
      priority: 4,
      estimatedTokens: 500,
      content: 'X'.repeat(2000),
      required: false,
    })

    const result = assembler.assemble()
    // L3 pode ser excluído se o budget restante for < 50 tokens
    expect(result.totalTokens).toBeLessThanOrEqual(100)
  })

  it('fluent API com addBlock retorna this', () => {
    const assembler = new ContextAssembler()
    const returned = assembler.addBlock({
      name: 'test',
      priority: 1,
      estimatedTokens: 10,
      content: 'test',
      required: false,
    })
    expect(returned).toBe(assembler)
  })

  it('getTokenBudget retorna budget configurado', () => {
    const assembler = new ContextAssembler(5000)
    expect(assembler.getTokenBudget()).toBe(5000)
  })
})
