/**
 * Testes unitários para commands/skills.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockCore = {
  skills: {
    list: vi.fn(() => [
      { name: 'typescript', description: 'Especialista em TypeScript para projetos Node.js e Bun' },
      { name: 'react', description: 'Especialista em React com hooks e padrões modernos' },
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

import { skillsCommand, skillsHandler } from './skills.js'

describe('skillsCommand', () => {
  it('retorna o yargs passado (passthrough)', () => {
    const mockYargs = { test: true }
    const result = skillsCommand(mockYargs as never)
    expect(result).toBe(mockYargs)
  })
})

describe('skillsHandler', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lista skills disponíveis no stdout', async () => {
    await skillsHandler()

    expect(mockCore.skills.list).toHaveBeenCalled()
    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('typescript')
    expect(output).toContain('react')
  })

  it('mostra a contagem de skills', async () => {
    await skillsHandler()

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    expect(output).toContain('2')
  })

  it('trunca descrição em 50 caracteres', async () => {
    await skillsHandler()

    const output = stdoutSpy.mock.calls.map((c) => c[0]).join('')
    // A descrição "Especialista em TypeScript para projetos Node.js e" tem 50 chars
    expect(output).toContain('Especialista em TypeScript para projetos Node.js e')
  })
})
