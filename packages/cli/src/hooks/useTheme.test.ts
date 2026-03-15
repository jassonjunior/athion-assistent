/**
 * Testes unitários para hooks/useTheme.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('react', () => ({
  useMemo: (fn: () => unknown) => fn(),
}))

vi.mock('../themes/index.js', () => ({
  getTheme: vi.fn((name: string) => {
    const themes: Record<string, { name: string; primary: string }> = {
      default: { name: 'default', primary: '#7aa2f7' },
      dark: { name: 'dark', primary: '#89b4fa' },
    }
    return themes[name] ?? themes['default']
  }),
}))

import { useTheme } from './useTheme.js'
import { getTheme } from '../themes/index.js'

describe('useTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('retorna o tema baseado na configuração do core', () => {
    const core = {
      config: { get: vi.fn(() => 'dark') },
    }

    const theme = useTheme(core as never)
    expect(core.config.get).toHaveBeenCalledWith('theme')
    expect(getTheme).toHaveBeenCalledWith('dark')
    expect(theme.name).toBe('dark')
  })

  it('retorna tema default quando config retorna valor desconhecido', () => {
    const core = {
      config: { get: vi.fn(() => 'nao-existe') },
    }

    const theme = useTheme(core as never)
    expect(theme.name).toBe('default')
  })

  it('retorna tema default quando config retorna "default"', () => {
    const core = {
      config: { get: vi.fn(() => 'default') },
    }

    const theme = useTheme(core as never)
    expect(theme.name).toBe('default')
  })
})
