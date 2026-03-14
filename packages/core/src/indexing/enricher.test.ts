import { describe, expect, it, vi } from 'vitest'
import { ProviderEnricher } from './adapters/provider-enricher'
import { NoopEnricher } from './adapters/noop-enricher'
import type { ProviderLayer } from '../provider/provider'

function createMockProvider(responseText: string): ProviderLayer {
  return {
    listProviders: vi.fn().mockReturnValue([{ id: 'test', name: 'Test' }]),
    listModels: vi.fn().mockReturnValue([{ id: 'test-model' }]),
    streamChat: vi.fn(),
    generateText: vi.fn().mockResolvedValue({ text: responseText, usage: { totalTokens: 10 } }),
  } as unknown as ProviderLayer
}

describe('ProviderEnricher', () => {
  describe('isAvailable', () => {
    it('retorna true quando provider tem modelos', async () => {
      const provider = createMockProvider('')
      const enricher = new ProviderEnricher(provider, 'test', 'test-model')
      expect(await enricher.isAvailable()).toBe(true)
    })

    it('retorna false quando provider não tem modelos', async () => {
      const provider = createMockProvider('')
      ;(provider.listModels as ReturnType<typeof vi.fn>).mockReturnValue([])
      const enricher = new ProviderEnricher(provider, 'test', 'test-model')
      expect(await enricher.isAvailable()).toBe(false)
    })
  })

  describe('generateRepoMeta', () => {
    it('parseia JSON válido do LLM', async () => {
      const json = JSON.stringify({
        language: 'TypeScript',
        framework: 'none',
        testFramework: 'vitest',
        entryPoints: ['src/index.ts'],
        buildSystem: 'bun',
        architectureStyle: 'hexagonal',
        databaseTech: 'sqlite',
        packageManager: 'bun',
      })
      const provider = createMockProvider(json)
      const enricher = new ProviderEnricher(provider, 'test', 'test-model')

      const result = await enricher.generateRepoMeta(['/src/index.ts', '/src/app.ts'])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.language).toBe('TypeScript')
        expect(result.value.buildSystem).toBe('bun')
        expect(result.value.entryPoints).toEqual(['src/index.ts'])
      }
    })

    it('remove markdown fences do JSON', async () => {
      const json =
        '```json\n{"language":"Python","framework":"Django","testFramework":"pytest","entryPoints":[],"buildSystem":"pip","architectureStyle":"mvc","databaseTech":"postgres","packageManager":"pip"}\n```'
      const provider = createMockProvider(json)
      const enricher = new ProviderEnricher(provider, 'test', 'test-model')

      const result = await enricher.generateRepoMeta(['/app.py'])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.language).toBe('Python')
      }
    })

    it('retorna Err para JSON inválido', async () => {
      const provider = createMockProvider('This is not JSON at all')
      const enricher = new ProviderEnricher(provider, 'test', 'test-model')

      const result = await enricher.generateRepoMeta(['/src/a.ts'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('json_parse')
      }
    })

    it('retorna Err quando LLM falha', async () => {
      const provider = createMockProvider('')
      ;(provider.generateText as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Connection refused'),
      )
      const enricher = new ProviderEnricher(provider, 'test', 'test-model')

      const result = await enricher.generateRepoMeta(['/src/a.ts'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('llm_unavailable')
      }
    })
  })

  describe('generateFileSummary', () => {
    it('parseia sumário de arquivo', async () => {
      const json = JSON.stringify({
        purpose: 'Database store for code chunks',
        exports: ['DbStore', 'StoredChunk'],
        patterns: ['singleton'],
        importsExternal: ['bun:sqlite'],
        importsInternal: ['./types'],
        complexity: 'medium',
      })
      const provider = createMockProvider(json)
      const enricher = new ProviderEnricher(provider, 'test', 'test-model')

      const result = await enricher.generateFileSummary('/src/db-store.ts', 'class DbStore {}')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.purpose).toBe('Database store for code chunks')
        expect(result.value.exports).toContain('DbStore')
        expect(result.value.complexity).toBe('medium')
      }
    })
  })

  describe('generateModuleSummary', () => {
    it('parseia sumário de módulo', async () => {
      const json = JSON.stringify({
        purpose: 'Indexing module for codebase search',
        publicApi: ['CodebaseIndexer', 'search'],
        dependsOn: ['provider', 'storage'],
        dependedBy: ['orchestrator'],
      })
      const provider = createMockProvider(json)
      const enricher = new ProviderEnricher(provider, 'test', 'test-model')

      const result = await enricher.generateModuleSummary('/src/indexing', [
        { path: '/src/indexing/manager.ts', exports: ['CodebaseIndexer'], purpose: 'Main indexer' },
      ])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.purpose).toContain('Indexing')
      }
    })
  })

  describe('generatePatternAnalysis', () => {
    it('parseia análise de padrões', async () => {
      const json = JSON.stringify({
        namingFunctions: 'camelCase',
        namingClasses: 'PascalCase',
        namingConstants: 'UPPER_SNAKE_CASE',
        namingFiles: 'kebab-case.ts',
        namingVariables: 'camelCase',
        errorHandling: 'Result type',
        importStyle: 'named imports with barrel files',
        testingPatterns: 'describe/it with vitest',
        architecturePatterns: 'hexagonal with ports/adapters',
        antiPatterns: 'none',
      })
      const provider = createMockProvider(json)
      const enricher = new ProviderEnricher(provider, 'test', 'test-model')

      const result = await enricher.generatePatternAnalysis([
        { path: '/src/index.ts', content: 'export class Foo {}' },
      ])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.namingFunctions).toBe('camelCase')
        expect(result.value.architecturePatterns).toContain('hexagonal')
      }
    })
  })
})

describe('NoopEnricher', () => {
  it('isAvailable retorna false', async () => {
    const enricher = new NoopEnricher()
    expect(await enricher.isAvailable()).toBe(false)
  })

  it('generateRepoMeta retorna dados mínimos', async () => {
    const enricher = new NoopEnricher()
    const result = await enricher.generateRepoMeta()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.language).toBe('unknown')
    }
  })

  it('generateFileSummary retorna dados mínimos', async () => {
    const enricher = new NoopEnricher()
    const result = await enricher.generateFileSummary()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.purpose).toBe('')
      expect(result.value.complexity).toBe('medium')
    }
  })

  it('generateModuleSummary retorna dados mínimos', async () => {
    const enricher = new NoopEnricher()
    const result = await enricher.generateModuleSummary()
    expect(result.ok).toBe(true)
  })

  it('generatePatternAnalysis retorna dados mínimos', async () => {
    const enricher = new NoopEnricher()
    const result = await enricher.generatePatternAnalysis()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.namingFunctions).toBe('unknown')
    }
  })
})
