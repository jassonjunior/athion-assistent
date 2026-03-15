/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it } from 'vitest'
import {
  searchAgent,
  searchToolsAgent,
  coderAgent,
  codeReviewAgent,
  refactorAgent,
  explainAgent,
  testWriterAgent,
  debugAgent,
  builtinAgents,
} from './builtins'

describe('builtin agents', () => {
  it('searchAgent tem configuração correta', () => {
    expect(searchAgent.name).toBe('search')
    expect(searchAgent.skill).toBe('search')
    expect(searchAgent.tools).toContain('search_codebase')
    expect(searchAgent.tools).toContain('task')
    expect(searchAgent.level).toBe('builtin')
    expect(searchAgent.maxTurns).toBeGreaterThan(0)
  })

  it('searchToolsAgent é internal (não exposto ao orchestrator)', () => {
    expect(searchToolsAgent.name).toBe('search-tools')
    expect(searchToolsAgent.level).toBe('internal')
    expect(searchToolsAgent.tools).toContain('read_file')
    expect(searchToolsAgent.tools).toContain('list_files')
    expect(searchToolsAgent.tools).toContain('search_files')
  })

  it('coderAgent tem tools de leitura e escrita', () => {
    expect(coderAgent.name).toBe('coder')
    expect(coderAgent.tools).toContain('search_codebase')
    expect(coderAgent.tools).toContain('read_file')
    expect(coderAgent.tools).toContain('write_file')
    expect(coderAgent.level).toBe('builtin')
  })

  it('codeReviewAgent é somente leitura (sem write_file)', () => {
    expect(codeReviewAgent.name).toBe('code-review')
    expect(codeReviewAgent.tools).not.toContain('write_file')
    expect(codeReviewAgent.tools).toContain('read_file')
    expect(codeReviewAgent.level).toBe('builtin')
  })

  it('refactorAgent tem tools de leitura e escrita', () => {
    expect(refactorAgent.name).toBe('refactorer')
    expect(refactorAgent.tools).toContain('write_file')
    expect(refactorAgent.tools).toContain('search_codebase')
  })

  it('explainAgent é somente leitura', () => {
    expect(explainAgent.name).toBe('explainer')
    expect(explainAgent.tools).not.toContain('write_file')
  })

  it('testWriterAgent pode escrever arquivos', () => {
    expect(testWriterAgent.name).toBe('test-writer')
    expect(testWriterAgent.tools).toContain('write_file')
  })

  it('debugAgent tem run_command para diagnóstico', () => {
    expect(debugAgent.name).toBe('debugger')
    expect(debugAgent.tools).toContain('run_command')
    expect(debugAgent.tools).toContain('write_file')
  })

  it('builtinAgents contém todos os agentes', () => {
    expect(builtinAgents).toHaveLength(8)
    const names = builtinAgents.map((a) => a.name)
    expect(names).toContain('search')
    expect(names).toContain('search-tools')
    expect(names).toContain('coder')
    expect(names).toContain('code-review')
    expect(names).toContain('refactorer')
    expect(names).toContain('explainer')
    expect(names).toContain('test-writer')
    expect(names).toContain('debugger')
  })

  it('todos os agentes têm campos obrigatórios', () => {
    for (const agent of builtinAgents) {
      expect(agent.name).toBeTruthy()
      expect(agent.description).toBeTruthy()
      expect(agent.skill).toBeTruthy()
      expect(Array.isArray(agent.tools)).toBe(true)
      expect(agent.level).toBeTruthy()
      expect(typeof agent.maxTurns).toBe('number')
      expect(agent.maxTurns!).toBeGreaterThan(0)
    }
  })

  it('nenhum agente builtin tem nome duplicado', () => {
    const names = builtinAgents.map((a) => a.name)
    const uniqueNames = new Set(names)
    expect(uniqueNames.size).toBe(names.length)
  })
})
