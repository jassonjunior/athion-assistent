import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { chunkFileWithTreeSitter, isTreeSitterAvailable } from './tree-sitter-chunker'

const fixturesDir = resolve(__dirname, '__fixtures__')
const SMALL_CHUNK = 10

describe('Tree-Sitter — Novas linguagens (Phase 2B)', () => {
  describe('Java', () => {
    it('detecta gramática disponível', async () => {
      const available = await isTreeSitterAvailable('java')
      expect(available).toBe(true)
    })

    it('extrai chunks com classes, métodos e enums', async () => {
      const result = await chunkFileWithTreeSitter(resolve(fixturesDir, 'Sample.java'), SMALL_CHUNK)
      expect(result).not.toBeNull()
      expect(result?.usedTreeSitter).toBe(true)

      const symbols = result?.chunks.filter((c) => c.symbolName).map((c) => c.symbolName) ?? []
      expect(symbols).toContain('UserService')
      expect(symbols).toContain('UserRepository')
      expect(symbols).toContain('UserRole')
    })

    it('extrai imports Java', async () => {
      const result = await chunkFileWithTreeSitter(resolve(fixturesDir, 'Sample.java'), SMALL_CHUNK)
      expect(result?.imports.length).toBeGreaterThan(0)
      expect(result?.imports.some((i) => i.includes('java.util.List'))).toBe(true)
    })
  })

  describe('Ruby', () => {
    it('detecta gramática disponível', async () => {
      const available = await isTreeSitterAvailable('ruby')
      expect(available).toBe(true)
    })

    it('extrai chunks com classes, módulos e métodos', async () => {
      const result = await chunkFileWithTreeSitter(resolve(fixturesDir, 'sample.rb'), SMALL_CHUNK)
      expect(result).not.toBeNull()
      expect(result?.usedTreeSitter).toBe(true)

      const symbols = result?.chunks.filter((c) => c.symbolName).map((c) => c.symbolName) ?? []
      expect(symbols).toContain('Authentication')
      expect(symbols).toContain('helper_function')
    })

    it('extrai imports Ruby (require)', async () => {
      const result = await chunkFileWithTreeSitter(resolve(fixturesDir, 'sample.rb'), SMALL_CHUNK)
      expect(result?.imports.length).toBeGreaterThan(0)
      expect(result?.imports.some((i) => i === 'json')).toBe(true)
    })
  })

  describe('C', () => {
    it('detecta gramática disponível', async () => {
      const available = await isTreeSitterAvailable('c')
      expect(available).toBe(true)
    })

    it('extrai chunks com funções e structs', async () => {
      const result = await chunkFileWithTreeSitter(resolve(fixturesDir, 'sample.c'), SMALL_CHUNK)
      expect(result).not.toBeNull()
      expect(result?.usedTreeSitter).toBe(true)

      const symbols = result?.chunks.filter((c) => c.symbolName).map((c) => c.symbolName) ?? []
      expect(symbols).toContain('print_student')
      expect(symbols).toContain('create_student')
    })

    it('extrai imports C (#include)', async () => {
      const result = await chunkFileWithTreeSitter(resolve(fixturesDir, 'sample.c'), SMALL_CHUNK)
      expect(result?.imports.length).toBeGreaterThan(0)
      expect(result?.imports.some((i) => i === 'stdio.h')).toBe(true)
    })
  })

  describe('PHP', () => {
    it('detecta gramática disponível', async () => {
      const available = await isTreeSitterAvailable('php')
      expect(available).toBe(true)
    })

    it('extrai chunks com classes e funções', async () => {
      const result = await chunkFileWithTreeSitter(resolve(fixturesDir, 'sample.php'), SMALL_CHUNK)
      expect(result).not.toBeNull()
      expect(result?.usedTreeSitter).toBe(true)

      const symbols = result?.chunks.filter((c) => c.symbolName).map((c) => c.symbolName) ?? []
      expect(symbols).toContain('AuthService')
    })
  })
})
