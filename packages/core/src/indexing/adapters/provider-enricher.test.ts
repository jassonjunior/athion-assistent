import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ProviderEnricher } from './provider-enricher'
import type { ProviderLayer } from '../../provider/provider'

function createMockProvider(
  generateTextResult: { text: string } | Error = { text: '{}' },
  modelsList: string[] = ['test-model'],
): ProviderLayer {
  return {
    listModels: vi.fn().mockReturnValue(modelsList),
    generateText: vi.fn().mockImplementation(() => {
      if (generateTextResult instanceof Error) throw generateTextResult
      return Promise.resolve(generateTextResult)
    }),
  } as unknown as ProviderLayer
}

describe('ProviderEnricher', () => {
  let mockProvider: ProviderLayer
  let enricher: ProviderEnricher

  beforeEach(() => {
    mockProvider = createMockProvider()
    enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')
  })

  describe('isAvailable', () => {
    it('retorna true quando provider tem modelos', async () => {
      const result = await enricher.isAvailable()
      expect(result).toBe(true)
      expect(mockProvider.listModels).toHaveBeenCalledWith('lmstudio')
    })

    it('retorna false quando provider não tem modelos', async () => {
      mockProvider = createMockProvider({ text: '{}' }, [])
      enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')

      const result = await enricher.isAvailable()
      expect(result).toBe(false)
    })

    it('retorna false quando listModels lança exceção', async () => {
      mockProvider = createMockProvider()
      vi.mocked(mockProvider.listModels).mockImplementation(() => {
        throw new Error('Connection refused')
      })
      enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')

      const result = await enricher.isAvailable()
      expect(result).toBe(false)
    })
  })

  describe('generateRepoMeta', () => {
    it('retorna Ok com RepoMeta válido', async () => {
      mockProvider = createMockProvider({
        text: JSON.stringify({
          language: 'typescript',
          framework: 'express',
          testFramework: 'vitest',
          entryPoints: ['src/index.ts'],
          buildSystem: 'bun',
          architectureStyle: 'hexagonal',
          databaseTech: 'sqlite',
          packageManager: 'bun',
        }),
      })
      enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')

      const result = await enricher.generateRepoMeta(['src/index.ts', 'src/app.ts'])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.language).toBe('typescript')
        expect(result.value.framework).toBe('express')
        expect(result.value.entryPoints).toEqual(['src/index.ts'])
      }
    })

    it('aceita packageJson opcional', async () => {
      mockProvider = createMockProvider({
        text: JSON.stringify({
          language: 'typescript',
          framework: 'none',
          testFramework: 'none',
          entryPoints: [],
          buildSystem: 'none',
          architectureStyle: 'none',
          databaseTech: 'none',
          packageManager: 'npm',
        }),
      })
      enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')

      const result = await enricher.generateRepoMeta(
        ['src/index.ts'],
        '{"name":"test","version":"1.0.0"}',
      )
      expect(result.ok).toBe(true)
    })

    it('retorna Err para JSON inválido do LLM', async () => {
      mockProvider = createMockProvider({ text: 'This is not JSON at all' })
      enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')

      const result = await enricher.generateRepoMeta(['src/index.ts'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('json_parse')
      }
    })

    it('retorna Err com code timeout quando provider dá timeout', async () => {
      mockProvider = createMockProvider(new Error('Request timeout'))
      enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')

      const result = await enricher.generateRepoMeta(['src/index.ts'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('timeout')
      }
    })

    it('retorna Err com code llm_unavailable para erros genéricos', async () => {
      mockProvider = createMockProvider(new Error('Connection refused'))
      enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')

      const result = await enricher.generateRepoMeta(['src/index.ts'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('llm_unavailable')
      }
    })

    it('parseia JSON com markdown fences', async () => {
      mockProvider = createMockProvider({
        text: '```json\n{"language":"python","framework":"django","testFramework":"pytest","entryPoints":["manage.py"],"buildSystem":"pip","architectureStyle":"mvc","databaseTech":"postgres","packageManager":"pip"}\n```',
      })
      enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')

      const result = await enricher.generateRepoMeta(['manage.py'])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.language).toBe('python')
      }
    })

    it('trata campos faltantes com defaults', async () => {
      mockProvider = createMockProvider({
        text: JSON.stringify({ language: 'go' }),
      })
      enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')

      const result = await enricher.generateRepoMeta(['main.go'])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.language).toBe('go')
        expect(result.value.framework).toBe('none')
        expect(result.value.entryPoints).toEqual([])
      }
    })
  })

  describe('generateFileSummary', () => {
    it('retorna Ok com FileSummary válido', async () => {
      mockProvider = createMockProvider({
        text: JSON.stringify({
          purpose: 'Main entry point',
          exports: ['main', 'init'],
          patterns: ['factory'],
          importsExternal: ['express'],
          importsInternal: ['./config'],
          complexity: 'medium',
        }),
      })
      enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')

      const result = await enricher.generateFileSummary('/src/index.ts', 'const x = 1')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.purpose).toBe('Main entry point')
        expect(result.value.exports).toEqual(['main', 'init'])
        expect(result.value.complexity).toBe('medium')
      }
    })

    it('normaliza complexity inválida para medium', async () => {
      mockProvider = createMockProvider({
        text: JSON.stringify({
          purpose: 'test',
          exports: [],
          patterns: [],
          importsExternal: [],
          importsInternal: [],
          complexity: 'extreme',
        }),
      })
      enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')

      const result = await enricher.generateFileSummary('/src/a.ts', 'code')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.complexity).toBe('medium')
      }
    })
  })

  describe('generateModuleSummary', () => {
    it('retorna Ok com ModuleSummary válido', async () => {
      mockProvider = createMockProvider({
        text: JSON.stringify({
          purpose: 'Authentication module',
          publicApi: ['login', 'register'],
          dependsOn: ['config', 'database'],
          dependedBy: ['api'],
        }),
      })
      enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')

      const result = await enricher.generateModuleSummary('/src/auth', [
        { path: '/src/auth/login.ts', exports: ['login'], purpose: 'Login logic' },
      ])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.purpose).toBe('Authentication module')
        expect(result.value.publicApi).toEqual(['login', 'register'])
      }
    })
  })

  describe('generatePatternAnalysis', () => {
    it('retorna Ok com PatternAnalysis válido', async () => {
      mockProvider = createMockProvider({
        text: JSON.stringify({
          namingFunctions: 'camelCase',
          namingClasses: 'PascalCase',
          namingConstants: 'UPPER_SNAKE_CASE',
          namingFiles: 'kebab-case',
          namingVariables: 'camelCase',
          errorHandling: 'Result type',
          importStyle: 'named imports',
          testingPatterns: 'describe/it with vitest',
          architecturePatterns: 'hexagonal',
          antiPatterns: 'none',
        }),
      })
      enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')

      const result = await enricher.generatePatternAnalysis([
        { path: '/src/a.ts', content: 'export function hello() {}' },
      ])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.namingFunctions).toBe('camelCase')
        expect(result.value.architecturePatterns).toBe('hexagonal')
      }
    })

    it('trata campos faltantes com defaults', async () => {
      mockProvider = createMockProvider({
        text: JSON.stringify({ namingFunctions: 'camelCase' }),
      })
      enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')

      const result = await enricher.generatePatternAnalysis([])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.namingFunctions).toBe('camelCase')
        expect(result.value.namingClasses).toBe('unknown')
        expect(result.value.antiPatterns).toBe('none')
      }
    })
  })

  describe('callLlm (via métodos públicos)', () => {
    it('envia provider e model corretos na chamada generateText', async () => {
      mockProvider = createMockProvider({
        text: JSON.stringify({ language: 'ts' }),
      })
      enricher = new ProviderEnricher(mockProvider, 'my-provider', 'my-model')

      await enricher.generateRepoMeta(['src/index.ts'])

      expect(mockProvider.generateText).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'my-provider',
          model: 'my-model',
          temperature: 0.1,
          maxTokens: 2000,
        }),
      )
    })

    it('retorna timeout error para ETIMEDOUT', async () => {
      mockProvider = createMockProvider(new Error('connect ETIMEDOUT'))
      enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')

      const result = await enricher.generateRepoMeta([])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('timeout')
      }
    })

    it('parseia JSON embutido em texto com prefixo', async () => {
      mockProvider = createMockProvider({
        text: 'Here is the analysis:\n{"language":"rust","framework":"actix","testFramework":"cargo test","entryPoints":["src/main.rs"],"buildSystem":"cargo","architectureStyle":"none","databaseTech":"none","packageManager":"cargo"}',
      })
      enricher = new ProviderEnricher(mockProvider, 'lmstudio', 'test-model')

      const result = await enricher.generateRepoMeta(['src/main.rs'])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.language).toBe('rust')
      }
    })
  })
})
