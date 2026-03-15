/**
 * Testes unitários para commands/agents.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockCore = {
  subagents: {
    list: vi.fn(() => [
      { name: 'coder', description: 'Agente de código' },
      { name: 'reviewer', description: 'Agente de revisão' },
    ]),
  },
}

vi.mock('@athion/core', () => ({
  bootstrap: vi.fn(async () => mockCore),
}))

vi.mock('node:path', async () => {
  const actual = await vi.importActual('node:path')
  return { ...(actual as object), resolve: vi.fn((...args: string[]) => args.join('/')) }
})

import { agentsCommand, agentsHandler } from './agents.js'

describe('agentsCommand', () => {
  it('retorna o yargs passado (passthrough)', () => {
    const mockYargs = { command: vi.fn() }
    const result = agentsCommand(mockYargs as never)
    expect(result).toBe(mockYargs)
  })
})

describe('agentsHandler', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lista agentes disponíveis no stdout', async () => {
    await agentsHandler()

    expect(mockCore.subagents.list).toHaveBeenCalled()
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('coder')
    expect(output).toContain('Agente de código')
    expect(output).toContain('reviewer')
    expect(output).toContain('Agente de revisão')
  })

  it('mostra a contagem de agentes', async () => {
    await agentsHandler()

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('2')
  })
})
