import { describe, expect, it } from 'vitest'
import { NoopEnricher } from './noop-enricher'

describe('NoopEnricher', () => {
  const enricher = new NoopEnricher()

  describe('isAvailable', () => {
    it('retorna sempre false', async () => {
      const result = await enricher.isAvailable()
      expect(result).toBe(false)
    })
  })

  describe('generateRepoMeta', () => {
    it('retorna Ok com valores padrão', async () => {
      const result = await enricher.generateRepoMeta(['src/index.ts'])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.language).toBe('unknown')
        expect(result.value.framework).toBe('none')
        expect(result.value.testFramework).toBe('none')
        expect(result.value.entryPoints).toEqual([])
        expect(result.value.buildSystem).toBe('none')
        expect(result.value.architectureStyle).toBe('none')
        expect(result.value.databaseTech).toBe('none')
        expect(result.value.packageManager).toBe('none')
      }
    })

    it('aceita packageJson sem erro', async () => {
      const result = await enricher.generateRepoMeta([], '{"name":"test"}')
      expect(result.ok).toBe(true)
    })
  })

  describe('generateFileSummary', () => {
    it('retorna Ok com valores padrão', async () => {
      const result = await enricher.generateFileSummary('/src/a.ts', 'const x = 1')
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.purpose).toBe('')
        expect(result.value.exports).toEqual([])
        expect(result.value.patterns).toEqual([])
        expect(result.value.importsExternal).toEqual([])
        expect(result.value.importsInternal).toEqual([])
        expect(result.value.complexity).toBe('medium')
      }
    })
  })

  describe('generateModuleSummary', () => {
    it('retorna Ok com valores padrão', async () => {
      const result = await enricher.generateModuleSummary('/src/auth', [
        { path: '/src/auth/login.ts', exports: ['login'], purpose: 'Login' },
      ])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.purpose).toBe('')
        expect(result.value.publicApi).toEqual([])
        expect(result.value.dependsOn).toEqual([])
        expect(result.value.dependedBy).toEqual([])
      }
    })
  })

  describe('generatePatternAnalysis', () => {
    it('retorna Ok com valores padrão', async () => {
      const result = await enricher.generatePatternAnalysis([
        { path: '/src/a.ts', content: 'code' },
      ])
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.namingFunctions).toBe('unknown')
        expect(result.value.namingClasses).toBe('unknown')
        expect(result.value.namingConstants).toBe('unknown')
        expect(result.value.namingFiles).toBe('unknown')
        expect(result.value.namingVariables).toBe('unknown')
        expect(result.value.errorHandling).toBe('unknown')
        expect(result.value.importStyle).toBe('unknown')
        expect(result.value.testingPatterns).toBe('unknown')
        expect(result.value.architecturePatterns).toBe('unknown')
        expect(result.value.antiPatterns).toBe('none')
      }
    })

    it('aceita samples vazio', async () => {
      const result = await enricher.generatePatternAnalysis([])
      expect(result.ok).toBe(true)
    })
  })

  describe('consistência da interface', () => {
    it('todos os métodos retornam Result com ok: true', async () => {
      const results = await Promise.all([
        enricher.generateRepoMeta([]),
        enricher.generateFileSummary('', ''),
        enricher.generateModuleSummary('', []),
        enricher.generatePatternAnalysis([]),
      ])
      for (const result of results) {
        expect(result.ok).toBe(true)
      }
    })
  })
})
