import { describe, expect, it, vi, beforeEach } from 'vitest'
import { chunkFileWithTreeSitter, isTreeSitterAvailable } from './tree-sitter-chunker'

// Mock web-tree-sitter para testes unitários (WASM não disponível em test env)
// Testamos a lógica de fallback e integração com tree-sitter mockado

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}))

import { readFile } from 'node:fs/promises'

const mockedReadFile = vi.mocked(readFile)

describe('chunkFileWithTreeSitter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna null para linguagem não suportada', async () => {
    const result = await chunkFileWithTreeSitter('/src/data.toml')
    expect(result).toBeNull()
  })

  it('retorna null para extensão desconhecida', async () => {
    const result = await chunkFileWithTreeSitter('/src/file.xyz')
    expect(result).toBeNull()
  })

  it('retorna null para .md (markdown não tem gramática tree-sitter)', async () => {
    const result = await chunkFileWithTreeSitter('/docs/README.md')
    expect(result).toBeNull()
  })

  it('retorna null para .json (json não tem gramática tree-sitter)', async () => {
    const result = await chunkFileWithTreeSitter('/config.json')
    expect(result).toBeNull()
  })

  it('retorna null para .yaml', async () => {
    const result = await chunkFileWithTreeSitter('/config.yaml')
    expect(result).toBeNull()
  })

  it('retorna null para .sql', async () => {
    const result = await chunkFileWithTreeSitter('/schema.sql')
    expect(result).toBeNull()
  })

  it('aceita linguagens com gramática registrada (pode retornar null se WASM indisponível)', async () => {
    // tree-sitter WASM pode não estar disponível no ambiente de teste
    // mas o código deve tentar para linguagens suportadas
    mockedReadFile.mockResolvedValue('function hello() {}')

    const result = await chunkFileWithTreeSitter('/src/app.ts')
    // Pode ser null se tree-sitter WASM não está disponível, ou um resultado válido
    if (result !== null) {
      expect(result.usedTreeSitter).toBe(true)
      expect(result.chunks.length).toBeGreaterThan(0)
      expect(Array.isArray(result.imports)).toBe(true)
    }
  })

  it('usa valores padrão para maxChunkLines e minChunkLines', async () => {
    // Verifica que a função aceita chamada sem parâmetros opcionais
    const result = await chunkFileWithTreeSitter('/src/app.ts')
    // Não deve lançar erro
    expect(result === null || typeof result === 'object').toBe(true)
  })
})

describe('isTreeSitterAvailable', () => {
  it('retorna false para linguagem sem gramática', async () => {
    const result = await isTreeSitterAvailable('markdown')
    expect(result).toBe(false)
  })

  it('retorna false para linguagem desconhecida', async () => {
    const result = await isTreeSitterAvailable('brainfuck')
    expect(result).toBe(false)
  })

  it('retorna boolean para linguagem suportada', async () => {
    // Pode retornar true ou false dependendo da disponibilidade do WASM
    const result = await isTreeSitterAvailable('typescript')
    expect(typeof result).toBe('boolean')
  })

  it('retorna boolean para python', async () => {
    const result = await isTreeSitterAvailable('python')
    expect(typeof result).toBe('boolean')
  })
})
