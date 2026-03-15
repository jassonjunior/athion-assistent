import { describe, it, expect } from 'vitest'
import { parseCodeBlocks } from './parseCodeBlocks.js'

describe('parseCodeBlocks', () => {
  it('retorna array vazio para string vazia', () => {
    expect(parseCodeBlocks('')).toEqual([])
  })

  it('retorna texto simples como ContentPart de tipo text', () => {
    const result = parseCodeBlocks('Hello world')
    expect(result).toEqual([{ type: 'text', content: 'Hello world' }])
  })

  it('extrai bloco de código com linguagem', () => {
    const input = '```typescript\nconst x = 1\n```'
    const result = parseCodeBlocks(input)
    expect(result).toEqual([{ type: 'code', content: 'const x = 1\n', language: 'typescript' }])
  })

  it('extrai bloco de código sem linguagem como "text"', () => {
    const input = '```\nsome code\n```'
    const result = parseCodeBlocks(input)
    expect(result).toEqual([{ type: 'code', content: 'some code\n', language: 'text' }])
  })

  it('trata markdown misto com texto e código', () => {
    const input = 'Antes\n```python\nprint("hi")\n```\nDepois'
    const result = parseCodeBlocks(input)
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ type: 'text', content: 'Antes\n' })
    expect(result[1]).toEqual({ type: 'code', content: 'print("hi")\n', language: 'python' })
    expect(result[2]).toEqual({ type: 'text', content: '\nDepois' })
  })

  it('trata múltiplos blocos de código', () => {
    const input = '```js\na()\n```\nmeio\n```py\nb()\n```'
    const result = parseCodeBlocks(input)
    const codeBlocks = result.filter((p) => p.type === 'code')
    expect(codeBlocks).toHaveLength(2)
    expect(codeBlocks[0]?.language).toBe('js')
    expect(codeBlocks[1]?.language).toBe('py')
  })
})
