/* eslint-disable require-yield */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createTaskTool } from './task-tool'
import type { TaskToolDeps } from './task-tool'
import type { SubAgentManager, SubAgentConfig, SubAgentTask } from '../subagent/types'

function makeSubagents(): SubAgentManager {
  return {
    spawn: vi.fn(async function* () {
      yield { type: 'start', agentName: 'coder', task: {} }
      yield { type: 'complete', task: { status: 'completed' } }
    }),
    list: vi.fn(() => [
      {
        name: 'coder',
        description: 'Codes stuff',
        skill: 'coder',
        tools: [],
        level: 'builtin' as const,
      },
      {
        name: 'search',
        description: 'Searches',
        skill: 'search',
        tools: [],
        level: 'builtin' as const,
      },
      {
        name: 'debugger',
        description: 'Debugs',
        skill: 'debug',
        tools: [],
        level: 'builtin' as const,
      },
      {
        name: 'code-review',
        description: 'Reviews',
        skill: 'review',
        tools: [],
        level: 'builtin' as const,
      },
      {
        name: 'refactorer',
        description: 'Refactors',
        skill: 'refactor',
        tools: [],
        level: 'builtin' as const,
      },
      {
        name: 'explainer',
        description: 'Explains',
        skill: 'explain',
        tools: [],
        level: 'builtin' as const,
      },
      {
        name: 'test-writer',
        description: 'Tests',
        skill: 'test',
        tools: [],
        level: 'builtin' as const,
      },
    ]),
    getAgent: vi.fn((name: string) => {
      const agents: Record<string, SubAgentConfig> = {
        coder: {
          name: 'coder',
          description: 'Codes',
          skill: 'coder',
          tools: [],
          level: 'builtin',
          maxTurns: 50,
        },
        search: {
          name: 'search',
          description: 'Searches',
          skill: 'search',
          tools: [],
          level: 'builtin',
          maxTurns: 15,
        },
        debugger: {
          name: 'debugger',
          description: 'Debugs',
          skill: 'debug',
          tools: [],
          level: 'builtin',
          maxTurns: 40,
        },
        'code-review': {
          name: 'code-review',
          description: 'Reviews',
          skill: 'review',
          tools: [],
          level: 'builtin',
          maxTurns: 20,
        },
        refactorer: {
          name: 'refactorer',
          description: 'Refactors',
          skill: 'refactor',
          tools: [],
          level: 'builtin',
          maxTurns: 40,
        },
        explainer: {
          name: 'explainer',
          description: 'Explains',
          skill: 'explain',
          tools: [],
          level: 'builtin',
          maxTurns: 15,
        },
        'test-writer': {
          name: 'test-writer',
          description: 'Tests',
          skill: 'test',
          tools: [],
          level: 'builtin',
          maxTurns: 30,
        },
      }
      return agents[name]
    }),
    registerAgent: vi.fn(),
  }
}

function makeBus() {
  return {
    publish: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    once: vi.fn(() => vi.fn()),
  }
}

function makeDeps(): TaskToolDeps {
  return {
    subagents: makeSubagents(),
    bus: makeBus() as unknown as TaskToolDeps['bus'],
  }
}

describe('createTaskTool', () => {
  let deps: TaskToolDeps

  beforeEach(() => {
    deps = makeDeps()
  })

  it('cria tool com nome "task"', () => {
    const tool = createTaskTool(deps)
    expect(tool.name).toBe('task')
    expect(tool.description).toBeTruthy()
  })

  it('executa task com agente existente e retorna sucesso', async () => {
    // Mock spawn to set task status
    ;(deps.subagents.spawn as ReturnType<typeof vi.fn>).mockImplementation(async function* (
      _config: SubAgentConfig,
      task: SubAgentTask,
    ) {
      task.status = 'completed'
      task.result = 'Code written successfully'
      yield { type: 'complete', task }
    })

    const tool = createTaskTool(deps)
    const result = await tool.execute({
      agent: 'coder',
      description: 'Write a hello world function',
    })

    expect(result.success).toBe(true)
    expect(result.data.agent).toBe('coder')
    expect(result.data.result).toContain('Code written')
  })

  it('retorna erro quando agente não encontrado', async () => {
    ;(deps.subagents.getAgent as ReturnType<typeof vi.fn>).mockReturnValue(undefined)

    const tool = createTaskTool(deps)
    const result = await tool.execute({
      agent: 'totally-nonexistent-agent',
      description: 'Do something',
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })

  it('retorna erro quando agente falha', async () => {
    ;(deps.subagents.spawn as ReturnType<typeof vi.fn>).mockImplementation(async function* (
      _config: SubAgentConfig,
      task: SubAgentTask,
    ) {
      task.status = 'failed'
      task.result = 'LLM unavailable'
      yield { type: 'error', error: new Error('fail'), task }
    })

    const tool = createTaskTool(deps)
    const result = await tool.execute({
      agent: 'coder',
      description: 'Fail please',
    })

    expect(result.success).toBe(false)
  })

  it('gera steps quando fornecidos', async () => {
    ;(deps.subagents.spawn as ReturnType<typeof vi.fn>).mockImplementation(async function* (
      _config: SubAgentConfig,
      task: SubAgentTask,
    ) {
      task.status = 'completed'
      yield { type: 'complete', task }
    })

    const tool = createTaskTool(deps)
    const result = await tool.execute({
      agent: 'coder',
      description: 'Multi-step task',
      steps: ['Step 1', 'Step 2'],
    })

    expect(result.success).toBe(true)
    expect(result.data.steps).toHaveLength(2)
    expect(result.data.steps[0].description).toBe('Step 1')
  })

  it('faz fuzzy match de agente por keyword', async () => {
    // getAgent returns undefined for exact match, but fuzzy should find it
    const originalGetAgent = deps.subagents.getAgent as ReturnType<typeof vi.fn>
    originalGetAgent.mockImplementation((name: string) => {
      // Only exact matches
      const agents: Record<string, SubAgentConfig> = {
        search: {
          name: 'search',
          description: 'Searches',
          skill: 'search',
          tools: [],
          level: 'builtin',
          maxTurns: 15,
        },
        coder: {
          name: 'coder',
          description: 'Codes',
          skill: 'coder',
          tools: [],
          level: 'builtin',
          maxTurns: 50,
        },
      }
      return agents[name]
    })
    ;(deps.subagents.spawn as ReturnType<typeof vi.fn>).mockImplementation(async function* (
      _config: SubAgentConfig,
      task: SubAgentTask,
    ) {
      task.status = 'completed'
      yield { type: 'complete', task }
    })

    const tool = createTaskTool(deps)
    // "codebase-analysis" should fuzzy-match to "search" via keyword map
    const result = await tool.execute({
      agent: 'codebase-analysis',
      description: 'Analyze the codebase',
    })

    expect(result.success).toBe(true)
    expect(result.data.agent).toBe('search')
  })

  it('publica flow events no bus durante execução', async () => {
    ;(deps.subagents.spawn as ReturnType<typeof vi.fn>).mockImplementation(async function* (
      _config: SubAgentConfig,
      task: SubAgentTask,
    ) {
      yield { type: 'start', agentName: 'coder', task }
      task.status = 'completed'
      yield { type: 'complete', task }
    })

    const tool = createTaskTool(deps)
    await tool.execute({ agent: 'coder', description: 'Test' })

    expect(deps.bus.publish).toHaveBeenCalled()
  })

  it('suporta continuation quando agente retorna partial', async () => {
    let callCount = 0
    ;(deps.subagents.spawn as ReturnType<typeof vi.fn>).mockImplementation(async function* (
      _config: SubAgentConfig,
      task: SubAgentTask,
    ) {
      callCount++
      if (callCount === 1) {
        task.status = 'partial'
        task.accumulatedResults = ['First batch done']
        task.remainingWork = 'Second batch'
        yield { type: 'continuation_needed', task }
      } else {
        task.status = 'completed'
        task.result = 'Second batch done'
        yield { type: 'complete', task }
      }
    })

    const tool = createTaskTool(deps)
    const result = await tool.execute({ agent: 'coder', description: 'Big task' })

    expect(result.success).toBe(true)
    expect(callCount).toBe(2)
  })

  it('captura exceções do spawn como erro', async () => {
    ;(deps.subagents.spawn as ReturnType<typeof vi.fn>).mockImplementation(async function* () {
      throw new Error('Spawn explosion')
    })

    const tool = createTaskTool(deps)
    const result = await tool.execute({ agent: 'coder', description: 'Boom' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('Spawn explosion')
  })
})
