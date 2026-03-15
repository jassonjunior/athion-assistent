/**
 * Testes unitários para themes/index.ts (getTheme, listThemes)
 */
import { describe, it, expect } from 'vitest'
import { getTheme, listThemes } from './index.js'

describe('getTheme', () => {
  it('retorna o tema padrão quando nome é "default"', () => {
    const theme = getTheme('default')
    expect(theme.name).toBe('default')
  })

  it('retorna o tema correto para cada nome válido', () => {
    const names = ['default', 'dark', 'light', 'minimal', 'dracula']
    for (const name of names) {
      const theme = getTheme(name)
      expect(theme.name).toBe(name)
    }
  })

  it('retorna o tema padrão para nome inexistente', () => {
    const theme = getTheme('nao-existe')
    expect(theme.name).toBe('default')
  })

  it('retorna o tema padrão para string vazia', () => {
    const theme = getTheme('')
    expect(theme.name).toBe('default')
  })

  it('tema retornado possui todas as propriedades de cor', () => {
    const theme = getTheme('dark')
    expect(theme).toHaveProperty('primary')
    expect(theme).toHaveProperty('secondary')
    expect(theme).toHaveProperty('accent')
    expect(theme).toHaveProperty('error')
    expect(theme).toHaveProperty('success')
    expect(theme).toHaveProperty('warning')
    expect(theme).toHaveProperty('muted')
  })
})

describe('listThemes', () => {
  it('retorna um array de strings', () => {
    const themes = listThemes()
    expect(Array.isArray(themes)).toBe(true)
    expect(themes.length).toBeGreaterThan(0)
    for (const t of themes) {
      expect(typeof t).toBe('string')
    }
  })

  it('contém os 5 temas built-in', () => {
    const themes = listThemes()
    expect(themes).toContain('default')
    expect(themes).toContain('dark')
    expect(themes).toContain('light')
    expect(themes).toContain('minimal')
    expect(themes).toContain('dracula')
  })

  it('retorna exatamente 5 temas', () => {
    expect(listThemes().length).toBe(5)
  })
})
