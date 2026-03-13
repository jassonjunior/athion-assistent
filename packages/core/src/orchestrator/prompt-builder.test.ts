import { describe, expect, it, vi } from 'vitest'
import { createPromptBuilder } from './prompt-builder'
import type { SkillManager } from '../skills/types'
import type { ToolDefinition } from '../tools/types'
import type { AgentDefinition, Session } from './types'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSession(): Session {
  return {
    id: 'sess-1',
    projectId: 'proj-1',
    title: 'T',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function makeSkillManager(overrides: Partial<SkillManager> = {}): SkillManager {
  return {
    loadFromDirectory: vi.fn().mockResolvedValue(0),
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn(() => undefined),
    findByTrigger: vi.fn(() => []),
    list: vi.fn(() => []),
    setActive: vi.fn(),
    getActive: vi.fn(() => undefined),
    clearActive: vi.fn(),
    ...overrides,
  } as unknown as SkillManager
}

const noTools: ToolDefinition[] = []
const noAgents: AgentDefinition[] = []

// ── prompt-builder: active skill only ────────────────────────────────────────

describe('createPromptBuilder — skill injection', () => {
  it('não inclui nenhuma skill quando não há skill ativa', () => {
    const skills = makeSkillManager({
      getActive: vi.fn(() => undefined),
      list: vi.fn(() => [
        {
          name: 'code-review',
          description: 'Review',
          instructions: 'Review everything carefully',
          triggers: [],
        },
        {
          name: 'my-refactor-skill',
          description: 'Refactor',
          instructions: 'Refactor code safely',
          triggers: [],
        },
      ]),
    })
    const pb = createPromptBuilder(skills)
    const prompt = pb.build(makeSession(), noTools, noAgents)

    expect(prompt).not.toContain('Review everything carefully')
    expect(prompt).not.toContain('Refactor code safely')
    expect(prompt).not.toContain('Available Skills')
  })

  it('inclui apenas a skill ativa quando há uma ativa', () => {
    const activeSkill = {
      name: 'debug',
      description: 'Debug',
      instructions: 'Debug systematically step-by-step',
      triggers: [],
    }
    const otherSkill = {
      name: 'my-refactor-skill',
      description: 'Refactor',
      instructions: 'Refactor code safely always',
      triggers: [],
    }
    const skills = makeSkillManager({
      getActive: vi.fn(() => activeSkill),
      list: vi.fn(() => [activeSkill, otherSkill]),
    })
    const pb = createPromptBuilder(skills)
    const prompt = pb.build(makeSession(), noTools, noAgents)

    expect(prompt).toContain('ACTIVE SKILL: debug')
    expect(prompt).toContain('Debug systematically step-by-step')
    // Não inclui a outra skill
    expect(prompt).not.toContain('Refactor code safely always')
    expect(prompt).not.toContain('my-refactor-skill')
  })

  it('não inclui seção "Available Skills" mesmo com muitas skills instaladas', () => {
    const manySkills = Array.from({ length: 10 }, (_, i) => ({
      name: `skill-${i}`,
      description: `Skill ${i}`,
      instructions: `Instructions for skill ${i}`,
      triggers: [],
    }))
    const skills = makeSkillManager({
      getActive: vi.fn(() => undefined),
      list: vi.fn(() => manySkills),
    })
    const pb = createPromptBuilder(skills)
    const prompt = pb.build(makeSession(), noTools, noAgents)

    expect(prompt).not.toContain('Available Skills')
    for (const s of manySkills) {
      expect(prompt).not.toContain(s.name)
    }
  })
})

// ── prompt-builder: system prompt size ───────────────────────────────────────

describe('createPromptBuilder — tamanho do prompt', () => {
  it('prompt sem skill ativa tem menos de 2000 chars', () => {
    const skills = makeSkillManager()
    const pb = createPromptBuilder(skills)
    const prompt = pb.build(makeSession(), noTools, noAgents)
    expect(prompt.length).toBeLessThan(2000)
  })

  it('prompt com skill ativa contém apenas as instruções dessa skill', () => {
    const bigInstructions = 'X'.repeat(5000)
    const activeSkill = {
      name: 'big-skill',
      description: 'Big',
      instructions: bigInstructions,
      triggers: [],
    }
    const otherSkills = Array.from({ length: 5 }, (_, i) => ({
      name: `other-${i}`,
      description: `Other ${i}`,
      instructions: 'Y'.repeat(1000),
      triggers: [],
    }))
    const skills = makeSkillManager({
      getActive: vi.fn(() => activeSkill),
      list: vi.fn(() => [activeSkill, ...otherSkills]),
    })
    const pb = createPromptBuilder(skills)
    const prompt = pb.build(makeSession(), noTools, noAgents)

    // Contém as instruções da skill ativa
    expect(prompt).toContain(bigInstructions)
    // NÃO contém as instruções das outras skills
    expect(prompt).not.toContain('Y'.repeat(1000))
  })
})
