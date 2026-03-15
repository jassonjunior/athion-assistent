/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeFile, mkdir, rm } from 'node:fs/promises'
import { describe, expect, it, beforeEach, afterAll } from 'vitest'
import { createSkillManager } from './manager'
import type { SkillDefinition } from './types'

const TEST_DIR = join(tmpdir(), 'athion-skill-manager-tests-' + Date.now())

beforeEach(async () => {
  try {
    await rm(TEST_DIR, { recursive: true, force: true })
  } catch {
    // ok
  }
  await mkdir(TEST_DIR, { recursive: true })
})

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
})

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    name: 'test-skill',
    description: 'A test skill',
    triggers: ['test'],
    instructions: 'Do testing things.',
    ...overrides,
  }
}

describe('createSkillManager', () => {
  describe('register / unregister', () => {
    it('registra e recupera uma skill', () => {
      const manager = createSkillManager()
      const skill = makeSkill()

      manager.register(skill)

      expect(manager.get('test-skill')).toBe(skill)
    })

    it('lança erro ao registrar skill duplicada', () => {
      const manager = createSkillManager()
      manager.register(makeSkill())

      expect(() => manager.register(makeSkill())).toThrow('already registered')
    })

    it('unregister remove a skill', () => {
      const manager = createSkillManager()
      manager.register(makeSkill())

      manager.unregister('test-skill')

      expect(manager.get('test-skill')).toBeUndefined()
    })

    it('unregister de skill inexistente não lança erro', () => {
      const manager = createSkillManager()
      expect(() => manager.unregister('nonexistent')).not.toThrow()
    })
  })

  describe('get', () => {
    it('retorna undefined para skill inexistente', () => {
      const manager = createSkillManager()
      expect(manager.get('nope')).toBeUndefined()
    })
  })

  describe('list', () => {
    it('lista todas as skills registradas', () => {
      const manager = createSkillManager()
      manager.register(makeSkill({ name: 'skill-a' }))
      manager.register(makeSkill({ name: 'skill-b' }))

      expect(manager.list()).toHaveLength(2)
    })

    it('retorna array vazio quando nenhuma skill registrada', () => {
      const manager = createSkillManager()
      expect(manager.list()).toEqual([])
    })
  })

  describe('findByTrigger', () => {
    it('encontra skills pelo trigger', () => {
      const manager = createSkillManager()
      manager.register(makeSkill({ name: 'commit', triggers: ['commit', 'commitar'] }))
      manager.register(makeSkill({ name: 'review', triggers: ['review', 'revisar'] }))

      const results = manager.findByTrigger('quero commitar esse código')
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('commit')
    })

    it('busca case-insensitive', () => {
      const manager = createSkillManager()
      manager.register(makeSkill({ name: 'commit', triggers: ['Commit'] }))

      const results = manager.findByTrigger('COMMIT something')
      expect(results).toHaveLength(1)
    })

    it('retorna múltiplas skills quando vários triggers batem', () => {
      const manager = createSkillManager()
      manager.register(makeSkill({ name: 'skill-a', triggers: ['test'] }))
      manager.register(makeSkill({ name: 'skill-b', triggers: ['test code'] }))

      const results = manager.findByTrigger('test code')
      expect(results).toHaveLength(2)
    })

    it('retorna array vazio quando nenhum trigger bate', () => {
      const manager = createSkillManager()
      manager.register(makeSkill({ name: 'commit', triggers: ['commit'] }))

      const results = manager.findByTrigger('deploy application')
      expect(results).toEqual([])
    })
  })

  describe('active skill', () => {
    it('setActive e getActive funcionam corretamente', () => {
      const manager = createSkillManager()
      const skill = makeSkill()
      manager.register(skill)

      manager.setActive('test-skill')

      expect(manager.getActive()).toBe(skill)
    })

    it('getActive retorna undefined quando nenhuma skill ativa', () => {
      const manager = createSkillManager()
      expect(manager.getActive()).toBeUndefined()
    })

    it('getActive retorna undefined se skill ativa não está registrada', () => {
      const manager = createSkillManager()
      manager.setActive('nonexistent')
      expect(manager.getActive()).toBeUndefined()
    })

    it('clearActive remove a skill ativa', () => {
      const manager = createSkillManager()
      manager.register(makeSkill())
      manager.setActive('test-skill')

      manager.clearActive()

      expect(manager.getActive()).toBeUndefined()
    })
  })

  describe('loadFromDirectory', () => {
    it('carrega skills de arquivos .md em um diretório', async () => {
      const skillContent =
        '# My Skill\n\nDescription here.\n\n## Triggers\n- test\n\n## Instructions\nDo things.\n'
      await writeFile(join(TEST_DIR, 'my-skill.md'), skillContent, 'utf-8')

      const manager = createSkillManager()
      const count = await manager.loadFromDirectory(TEST_DIR)

      expect(count).toBe(1)
      expect(manager.get('my-skill')).toBeDefined()
    })

    it('retorna 0 para diretório inexistente', async () => {
      const manager = createSkillManager()
      const count = await manager.loadFromDirectory('/tmp/nonexistent-dir-12345')

      expect(count).toBe(0)
    })

    it('não sobrescreve skill já registrada com mesmo nome', async () => {
      const manager = createSkillManager()
      const existingSkill = makeSkill({ name: 'my-skill', description: 'Original' })
      manager.register(existingSkill)

      const skillContent = '# My Skill\n\nNova description.\n'
      await writeFile(join(TEST_DIR, 'my-skill.md'), skillContent, 'utf-8')

      await manager.loadFromDirectory(TEST_DIR)

      expect(manager.get('my-skill')!.description).toBe('Original')
    })

    it('ignora arquivos não-md', async () => {
      await writeFile(join(TEST_DIR, 'not-a-skill.txt'), 'Not a skill', 'utf-8')

      const manager = createSkillManager()
      const count = await manager.loadFromDirectory(TEST_DIR)

      expect(count).toBe(0)
    })
  })
})
