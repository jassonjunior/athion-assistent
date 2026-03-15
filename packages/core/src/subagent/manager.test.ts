/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createSubAgentManager } from './manager'
import type { SubAgentManagerDeps } from './manager'
import type { SubAgentConfig, SubAgentTask } from './types'

// Mock runSubAgent
vi.mock('./agent', () => ({
  runSubAgent: vi.fn(function* () {
    yield { type: 'start', agentName: 'test', task: {} }
    yield { type: 'complete', task: { status: 'completed' } }
  }),
}))

function makeDeps(): SubAgentManagerDeps {
  return {
    config: {
      get: vi.fn((key: string) => {
        const map: Record<string, unknown> = {
          provider: 'test-provider',
          model: 'test-model',
          agentModel: 'agent-model',
          maxTokens: 8192,
          maxOutputTokens: 8192,
        }
        return map[key]
      }),
      set: vi.fn(),
    } as unknown as SubAgentManagerDeps['config'],
    provider: {
      listProviders: vi.fn(() => []),
      listModels: vi.fn(() => []),
      streamChat: vi.fn(),
      generateText: vi.fn(),
    } as unknown as SubAgentManagerDeps['provider'],
    tools: {
      register: vi.fn(),
      get: vi.fn(),
      list: vi.fn(() => []),
      has: vi.fn(() => false),
    } as unknown as SubAgentManagerDeps['tools'],
    skills: {
      get: vi.fn(),
      list: vi.fn(() => []),
      reload: vi.fn(),
    } as unknown as SubAgentManagerDeps['skills'],
  }
}

function makeConfig(overrides: Partial<SubAgentConfig> = {}): SubAgentConfig {
  return {
    name: 'test-agent',
    description: 'A test agent',
    skill: 'test-skill',
    tools: [],
    level: 'builtin',
    maxTurns: 5,
    ...overrides,
  }
}

function makeTask(overrides: Partial<SubAgentTask> = {}): SubAgentTask {
  return {
    id: 'task-1',
    name: 'test-task',
    description: 'Do something',
    status: 'pending',
    steps: [],
    accumulatedResults: [],
    continuationIndex: 0,
    maxContinuations: 3,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

describe('createSubAgentManager', () => {
  let deps: SubAgentManagerDeps

  beforeEach(() => {
    deps = makeDeps()
  })

  describe('registerAgent / getAgent', () => {
    it('registra e recupera um agente', () => {
      const manager = createSubAgentManager(deps)
      const config = makeConfig()

      manager.registerAgent(config)

      expect(manager.getAgent('test-agent')).toBe(config)
    })

    it('retorna undefined para agente inexistente', () => {
      const manager = createSubAgentManager(deps)
      expect(manager.getAgent('nonexistent')).toBeUndefined()
    })

    it('sobrescreve agente com mesmo nome', () => {
      const manager = createSubAgentManager(deps)
      manager.registerAgent(makeConfig({ description: 'v1' }))
      manager.registerAgent(makeConfig({ description: 'v2' }))

      expect(manager.getAgent('test-agent')!.description).toBe('v2')
    })
  })

  describe('list', () => {
    it('lista todos os agentes registrados como SubAgentInfo', () => {
      const manager = createSubAgentManager(deps)
      manager.registerAgent(makeConfig({ name: 'agent-a' }))
      manager.registerAgent(makeConfig({ name: 'agent-b' }))

      const list = manager.list()
      expect(list).toHaveLength(2)
      expect(list[0]).toHaveProperty('name')
      expect(list[0]).toHaveProperty('description')
      expect(list[0]).toHaveProperty('skill')
      expect(list[0]).toHaveProperty('tools')
      expect(list[0]).toHaveProperty('level')
    })

    it('retorna array vazio quando nenhum agente registrado', () => {
      const manager = createSubAgentManager(deps)
      expect(manager.list()).toEqual([])
    })
  })

  describe('spawn', () => {
    it('retorna async generator de eventos', async () => {
      const manager = createSubAgentManager(deps)
      const config = makeConfig()
      const task = makeTask()

      const events: unknown[] = []
      for await (const event of manager.spawn(config, task)) {
        events.push(event)
      }

      expect(events.length).toBeGreaterThan(0)
    })
  })
})
