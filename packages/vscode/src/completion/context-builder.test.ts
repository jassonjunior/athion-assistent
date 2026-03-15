/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi } from 'vitest'

vi.mock('vscode', () => ({
  Range: class MockRange {
    constructor(
      public startLine: number,
      public startChar: number,
      public endLine: number,
      public endChar: number,
    ) {}
  },
}))

import { buildCompletionContext } from './context-builder.js'

function createMockDocument(lines: string[]) {
  return {
    lineCount: lines.length,
    lineAt: (line: number) => ({
      text: lines[line] ?? '',
    }),
    getText: vi.fn(
      (range: { startLine: number; startChar: number; endLine: number; endChar: number }) => {
        // Simulate getText based on range
        const result: string[] = []
        for (let i = range.startLine; i <= range.endLine; i++) {
          const lineText = lines[i] ?? ''
          if (i === range.startLine && i === range.endLine) {
            result.push(lineText.slice(range.startChar, range.endChar))
          } else if (i === range.startLine) {
            result.push(lineText.slice(range.startChar))
          } else if (i === range.endLine) {
            result.push(lineText.slice(0, range.endChar))
          } else {
            result.push(lineText)
          }
        }
        return result.join('\n')
      },
    ),
  }
}

function createMockPosition(line: number, character: number) {
  return { line, character }
}

describe('buildCompletionContext', () => {
  it('retorna prefix e suffix para posicao no meio do documento', () => {
    const lines = ['line1', 'line2', 'line3', 'line4', 'line5']
    const doc = createMockDocument(lines)
    const pos = createMockPosition(2, 3)

    const result = buildCompletionContext(doc as never, pos as never)

    expect(doc.getText).toHaveBeenCalledTimes(2)
    expect(result).toHaveProperty('prefix')
    expect(result).toHaveProperty('suffix')
  })

  it('prefix comeca na linha 0 quando cursor esta dentro do limite', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line${i}`)
    const doc = createMockDocument(lines)
    const pos = createMockPosition(10, 5)

    buildCompletionContext(doc as never, pos as never)

    // First call is for prefix range: Math.max(0, 10-100) = 0
    const prefixRange = doc.getText.mock.calls[0]?.[0]
    expect(prefixRange.startLine).toBe(0)
  })

  it('prefix comeca na linha correta quando cursor esta longe do inicio', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line${i}`)
    const doc = createMockDocument(lines)
    const pos = createMockPosition(150, 5)

    buildCompletionContext(doc as never, pos as never)

    // Prefix starts at 150 - 100 = 50
    const prefixRange = doc.getText.mock.calls[0]?.[0]
    expect(prefixRange.startLine).toBe(50)
  })

  it('suffix termina na ultima linha quando cursor esta perto do fim', () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line${i}`)
    const doc = createMockDocument(lines)
    const pos = createMockPosition(10, 3)

    buildCompletionContext(doc as never, pos as never)

    // Suffix ends at min(19, 10+50) = 19
    const suffixRange = doc.getText.mock.calls[1]?.[0]
    expect(suffixRange.endLine).toBe(19)
  })

  it('suffix termina no limite de 50 linhas', () => {
    const lines = Array.from({ length: 200 }, (_, i) => `line${i}`)
    const doc = createMockDocument(lines)
    const pos = createMockPosition(50, 5)

    buildCompletionContext(doc as never, pos as never)

    // Suffix ends at min(199, 50+50) = 100
    const suffixRange = doc.getText.mock.calls[1]?.[0]
    expect(suffixRange.endLine).toBe(100)
  })

  it('funciona com documento de uma unica linha', () => {
    const lines = ['hello world']
    const doc = createMockDocument(lines)
    const pos = createMockPosition(0, 5)

    const result = buildCompletionContext(doc as never, pos as never)

    expect(result).toHaveProperty('prefix')
    expect(result).toHaveProperty('suffix')
  })

  it('funciona com cursor no inicio do documento', () => {
    const lines = ['first line', 'second line']
    const doc = createMockDocument(lines)
    const pos = createMockPosition(0, 0)

    const result = buildCompletionContext(doc as never, pos as never)

    // Prefix should be empty
    const prefixRange = doc.getText.mock.calls[0]?.[0]
    expect(prefixRange.startLine).toBe(0)
    expect(prefixRange.startChar).toBe(0)
    expect(prefixRange.endLine).toBe(0)
    expect(prefixRange.endChar).toBe(0)
  })
})
