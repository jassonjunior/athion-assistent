/**
 * Testes unitários para themes.ts
 */
import { describe, it, expect } from 'vitest'
import { defaultTheme, darkTheme, lightTheme, minimalTheme, draculaTheme } from './themes.js'

const allThemes = [defaultTheme, darkTheme, lightTheme, minimalTheme, draculaTheme]

describe('themes', () => {
  it('cada tema possui todas as propriedades obrigatórias', () => {
    const requiredKeys = [
      'name',
      'primary',
      'secondary',
      'accent',
      'error',
      'success',
      'warning',
      'muted',
    ]
    for (const theme of allThemes) {
      for (const key of requiredKeys) {
        expect(theme).toHaveProperty(key)
        expect((theme as Record<string, unknown>)[key]).toBeTruthy()
      }
    }
  })

  it('todos os temas possuem nomes únicos', () => {
    const names = allThemes.map((t) => t.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('defaultTheme tem nome "default"', () => {
    expect(defaultTheme.name).toBe('default')
  })

  it('darkTheme tem nome "dark"', () => {
    expect(darkTheme.name).toBe('dark')
  })

  it('lightTheme tem nome "light"', () => {
    expect(lightTheme.name).toBe('light')
  })

  it('minimalTheme tem nome "minimal"', () => {
    expect(minimalTheme.name).toBe('minimal')
  })

  it('draculaTheme tem nome "dracula"', () => {
    expect(draculaTheme.name).toBe('dracula')
  })

  it('temas com cores hex possuem formato válido (#rrggbb ou nome ANSI)', () => {
    const hexPattern = /^#[0-9a-fA-F]{6}$/
    const colorKeys = [
      'primary',
      'secondary',
      'accent',
      'error',
      'success',
      'warning',
      'muted',
    ] as const

    for (const theme of [defaultTheme, darkTheme, lightTheme, draculaTheme]) {
      for (const key of colorKeys) {
        expect(theme[key]).toMatch(hexPattern)
      }
    }
  })

  it('minimalTheme usa nomes de cor ANSI (não hex)', () => {
    const ansiColors = ['white', 'red', 'green', 'yellow', 'gray', 'blue', 'cyan', 'magenta']
    const colorKeys = [
      'primary',
      'secondary',
      'accent',
      'error',
      'success',
      'warning',
      'muted',
    ] as const

    for (const key of colorKeys) {
      expect(ansiColors).toContain(minimalTheme[key])
    }
  })
})
