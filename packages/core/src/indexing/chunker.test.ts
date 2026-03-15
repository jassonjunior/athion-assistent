import { describe, expect, it, vi, beforeEach } from 'vitest'
import { chunkFile, generateChunkId } from './chunker'

// Mock tree-sitter-chunker para controlar quando tree-sitter está disponível
vi.mock('./tree-sitter-chunker', () => ({
  chunkFileWithTreeSitter: vi.fn().mockResolvedValue(null),
}))

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

import { chunkFileWithTreeSitter } from './tree-sitter-chunker'
import { readFile } from 'node:fs/promises'

const mockedReadFile = vi.mocked(readFile)
const mockedTreeSitter = vi.mocked(chunkFileWithTreeSitter)

describe('generateChunkId', () => {
  it('gera hash SHA256 de 16 caracteres', () => {
    const id = generateChunkId('/src/index.ts', 0, 10)
    expect(id).toHaveLength(16)
    expect(/^[0-9a-f]{16}$/.test(id)).toBe(true)
  })

  it('gera IDs diferentes para inputs diferentes', () => {
    const id1 = generateChunkId('/src/a.ts', 0, 10)
    const id2 = generateChunkId('/src/b.ts', 0, 10)
    const id3 = generateChunkId('/src/a.ts', 0, 20)
    expect(id1).not.toBe(id2)
    expect(id1).not.toBe(id3)
  })

  it('gera ID idêntico para mesmos inputs (determinístico)', () => {
    const id1 = generateChunkId('/src/a.ts', 5, 15)
    const id2 = generateChunkId('/src/a.ts', 5, 15)
    expect(id1).toBe(id2)
  })
})

describe('chunkFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedTreeSitter.mockResolvedValue(null)
  })

  it('retorna resultado do tree-sitter se disponível', async () => {
    const tsChunks = [
      {
        filePath: '/src/a.ts',
        language: 'typescript',
        startLine: 0,
        endLine: 5,
        content: 'function foo() {}',
        chunkType: 'function' as const,
      },
    ]
    mockedTreeSitter.mockResolvedValue({
      chunks: tsChunks,
      usedTreeSitter: true,
      imports: [],
    })

    const result = await chunkFile('/src/a.ts')
    expect(result.chunks).toEqual(tsChunks)
    expect(mockedTreeSitter).toHaveBeenCalledWith('/src/a.ts', 60, 3)
  })

  it('faz fallback para regex quando tree-sitter retorna null', async () => {
    mockedTreeSitter.mockResolvedValue(null)
    mockedReadFile.mockResolvedValue('const x = 1\nconst y = 2\n')

    const result = await chunkFile('/src/small.ts')
    expect(result.chunks.length).toBeGreaterThan(0)
    // Arquivo pequeno → chunk único tipo 'file'
    expect(result.chunks[0]?.chunkType).toBe('file')
  })

  it('retorna chunks vazio se readFile falha no fallback regex', async () => {
    mockedTreeSitter.mockResolvedValue(null)
    mockedReadFile.mockRejectedValue(new Error('ENOENT'))

    const result = await chunkFile('/nonexistent.ts')
    expect(result.chunks).toEqual([])
  })

  it('arquivo pequeno retorna chunk único tipo file', async () => {
    mockedTreeSitter.mockResolvedValue(null)
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n')
    mockedReadFile.mockResolvedValue(lines)

    const result = await chunkFile('/src/small.ts')
    expect(result.chunks).toHaveLength(1)
    expect(result.chunks[0]?.chunkType).toBe('file')
    expect(result.chunks[0]?.startLine).toBe(0)
    expect(result.chunks[0]?.endLine).toBe(9)
  })

  it('arquivo TypeScript grande usa chunking semântico', async () => {
    mockedTreeSitter.mockResolvedValue(null)
    // Gera arquivo TS com múltiplas funções
    const lines: string[] = []
    for (let i = 0; i < 200; i++) {
      if (i === 0) lines.push('import { something } from "./dep"')
      else if (i === 10) lines.push('export function foo() {')
      else if (i === 50) lines.push('export function bar() {')
      else if (i === 100) lines.push('export class MyClass {')
      else if (i === 150) lines.push('const helper = () => {')
      else lines.push(`  // line ${i}`)
    }
    mockedReadFile.mockResolvedValue(lines.join('\n'))

    const result = await chunkFile('/src/big.ts', { maxChunkLines: 60, minChunkLines: 3 })
    expect(result.chunks.length).toBeGreaterThan(1)

    // Deve ter chunks com tipos semânticos
    const types = result.chunks.map((c) => c.chunkType)
    expect(types).toContain('function')
  })

  it('linguagem sem padrão semântico usa sliding window', async () => {
    mockedTreeSitter.mockResolvedValue(null)
    const lines = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n')
    mockedReadFile.mockResolvedValue(lines)

    // .txt não tem padrão semântico
    const result = await chunkFile('/src/data.toml', { maxChunkLines: 50 })
    expect(result.chunks.length).toBeGreaterThan(1)
    // Todos os chunks devem ser do tipo 'block'
    for (const chunk of result.chunks) {
      expect(chunk.chunkType).toBe('block')
    }
  })

  it('respeita maxChunkLines customizado', async () => {
    mockedTreeSitter.mockResolvedValue(null)
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')
    mockedReadFile.mockResolvedValue(lines)

    const result = await chunkFile('/src/data.toml', { maxChunkLines: 20 })
    for (const chunk of result.chunks) {
      const chunkLineCount = chunk.endLine - chunk.startLine + 1
      expect(chunkLineCount).toBeLessThanOrEqual(20)
    }
  })

  it('detecta symbolName em funções TypeScript', async () => {
    mockedTreeSitter.mockResolvedValue(null)
    const lines: string[] = []
    for (let i = 0; i < 100; i++) {
      if (i === 0) lines.push('export function myFunction() {')
      else if (i === 50) lines.push('export class MyClass {')
      else lines.push(`  // line ${i}`)
    }
    mockedReadFile.mockResolvedValue(lines.join('\n'))

    const result = await chunkFile('/src/app.ts', { maxChunkLines: 60, minChunkLines: 3 })
    const funcChunk = result.chunks.find((c) => c.symbolName === 'myFunction')
    expect(funcChunk).toBeDefined()
    expect(funcChunk?.chunkType).toBe('function')
  })

  it('detecta symbolName de classe', async () => {
    mockedTreeSitter.mockResolvedValue(null)
    const lines: string[] = []
    for (let i = 0; i < 100; i++) {
      if (i === 0) lines.push('class MyService {')
      else if (i === 50) lines.push('function helper() {')
      else lines.push(`  // line ${i}`)
    }
    mockedReadFile.mockResolvedValue(lines.join('\n'))

    const result = await chunkFile('/src/service.ts', { maxChunkLines: 60, minChunkLines: 3 })
    const classChunk = result.chunks.find((c) => c.symbolName === 'MyService')
    expect(classChunk).toBeDefined()
    expect(classChunk?.chunkType).toBe('class')
  })

  it('passa opções corretas para tree-sitter', async () => {
    mockedTreeSitter.mockResolvedValue(null)
    mockedReadFile.mockResolvedValue('const x = 1')

    await chunkFile('/src/a.ts', { maxChunkLines: 40, minChunkLines: 5 })
    expect(mockedTreeSitter).toHaveBeenCalledWith('/src/a.ts', 40, 5)
  })

  it('trunca conteúdo longo em chunks', async () => {
    mockedTreeSitter.mockResolvedValue(null)
    // Gera conteúdo > 2048 chars
    const longLine = 'x'.repeat(300)
    const lines = Array.from({ length: 20 }, () => longLine).join('\n')
    mockedReadFile.mockResolvedValue(lines)

    const result = await chunkFile('/src/big.ts')
    for (const chunk of result.chunks) {
      // Conteúdo deve ser truncado se original > 2048
      if (chunk.content.length > 2048) {
        fail('Chunk content should be truncated to around 2048 chars')
      }
    }
  })
})
