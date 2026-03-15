import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createSkillRegistry } from './registry'
import type { SkillManager } from './types'

// Mock registry-data
vi.mock('./registry-data', () => ({
  registryData: {
    version: 1,
    skills: [
      {
        name: 'commit-message',
        description: 'Gerar mensagens de commit',
        triggers: ['commit'],
        tags: ['git', 'commit'],
        author: 'athion',
        content: '# Commit Message\n\nContent here.',
      },
      {
        name: 'code-reviewer',
        description: 'Review de código',
        triggers: ['review'],
        tags: ['review', 'quality'],
        author: 'athion',
        content: '# Code Reviewer\n\nContent here.',
      },
    ],
  },
}))

function makeSkillManager(): SkillManager {
  const skills = new Map<string, { name: string }>()
  return {
    loadFromDirectory: vi.fn().mockResolvedValue(0),
    register: vi.fn(),
    unregister: vi.fn((name: string) => {
      skills.delete(name)
    }),
    get: vi.fn((name: string) => skills.get(name) as never),
    findByTrigger: vi.fn(() => []),
    list: vi.fn(() => []),
    setActive: vi.fn(),
    getActive: vi.fn(() => undefined),
    clearActive: vi.fn(),
  }
}

describe('createSkillRegistry', () => {
  let skillManager: SkillManager

  beforeEach(() => {
    skillManager = makeSkillManager()
  })

  describe('search', () => {
    it('retorna todas as skills quando query é vazio', () => {
      const registry = createSkillRegistry(skillManager)
      const results = registry.search()

      expect(results).toHaveLength(2)
    })

    it('filtra por nome', () => {
      const registry = createSkillRegistry(skillManager)
      const results = registry.search('commit')

      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('commit-message')
    })

    it('filtra por descrição', () => {
      const registry = createSkillRegistry(skillManager)
      const results = registry.search('review')

      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('code-reviewer')
    })

    it('filtra por tags', () => {
      const registry = createSkillRegistry(skillManager)
      const results = registry.search('git')

      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('commit-message')
    })

    it('filtra por triggers', () => {
      const registry = createSkillRegistry(skillManager)
      const results = registry.search('review')

      expect(results.some((r) => r.name === 'code-reviewer')).toBe(true)
    })

    it('retorna array vazio quando nenhuma skill bate', () => {
      const registry = createSkillRegistry(skillManager)
      const results = registry.search('nonexistent-xyz')

      expect(results).toEqual([])
    })
  })

  describe('listAvailable', () => {
    it('retorna todas as skills do catálogo', () => {
      const registry = createSkillRegistry(skillManager)
      const all = registry.listAvailable()

      expect(all).toHaveLength(2)
    })
  })

  describe('isInstalled', () => {
    it('retorna false quando skill não está no SkillManager', () => {
      const registry = createSkillRegistry(skillManager)
      expect(registry.isInstalled('commit-message')).toBe(false)
    })

    it('retorna true quando skill está no SkillManager', () => {
      ;(skillManager.get as ReturnType<typeof vi.fn>).mockReturnValue({ name: 'commit-message' })
      const registry = createSkillRegistry(skillManager)

      expect(registry.isInstalled('commit-message')).toBe(true)
    })
  })

  describe('install', () => {
    it('retorna erro para skill não encontrada', async () => {
      const registry = createSkillRegistry(skillManager)
      const result = await registry.install('nonexistent-skill')

      expect(result.success).toBe(false)
      expect(result.error).toContain('não encontrada')
    })

    it('retorna erro se skill já instalada', async () => {
      ;(skillManager.get as ReturnType<typeof vi.fn>).mockReturnValue({ name: 'commit-message' })
      const registry = createSkillRegistry(skillManager)

      const result = await registry.install('commit-message')

      expect(result.success).toBe(false)
      expect(result.error).toContain('já está instalada')
    })
  })

  describe('uninstall', () => {
    it('retorna erro se skill não encontrada em disco', async () => {
      const registry = createSkillRegistry(skillManager)
      const result = await registry.uninstall('nonexistent-on-disk')

      expect(result.success).toBe(false)
      expect(result.error).toContain('não encontrada')
    })
  })
})
