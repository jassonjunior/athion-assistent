import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { createToolRegistry, defineTool } from './registry'
import { getToolLevel, isOrchestratorTool } from './types'

const echoTool = defineTool({
  name: 'echo',
  description: 'Retorna o mesmo texto',
  parameters: z.object({ text: z.string() }),
  execute: async ({ text }) => ({ success: true as const, data: text }),
  level: 'orchestrator',
})

const failTool = defineTool({
  name: 'fail',
  description: 'Sempre falha',
  parameters: z.object({ reason: z.string().optional() }),
  execute: async ({ reason }) => {
    throw new Error(reason ?? 'forced failure')
  },
})

describe('createToolRegistry', () => {
  it('registra e recupera uma tool', () => {
    const registry = createToolRegistry()
    registry.register(echoTool)
    expect(registry.get('echo')).toBe(echoTool)
  })

  it('lança erro ao registrar tool duplicada', () => {
    const registry = createToolRegistry()
    registry.register(echoTool)
    expect(() => registry.register(echoTool)).toThrow("Tool 'echo' is already registered")
  })

  it('unregister remove a tool', () => {
    const registry = createToolRegistry()
    registry.register(echoTool)
    registry.unregister('echo')
    expect(registry.get('echo')).toBeUndefined()
  })

  it('unregister de tool inexistente não lança erro', () => {
    const registry = createToolRegistry()
    expect(() => registry.unregister('nonexistent')).not.toThrow()
  })

  it('list retorna todas as tools registradas', () => {
    const registry = createToolRegistry()
    registry.register(echoTool)
    registry.register(failTool)
    const tools = registry.list()
    expect(tools).toHaveLength(2)
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(['echo', 'fail']))
  })

  it('list retorna array vazio quando nenhuma tool registrada', () => {
    const registry = createToolRegistry()
    expect(registry.list()).toEqual([])
  })

  it('execute retorna resultado correto', async () => {
    const registry = createToolRegistry()
    registry.register(echoTool)
    const result = await registry.execute('echo', { text: 'hello' })
    expect(result.success).toBe(true)
    expect(result.data).toBe('hello')
  })

  it('execute retorna erro se tool não existe', async () => {
    const registry = createToolRegistry()
    const result = await registry.execute('nonexistent', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('nonexistent')
  })

  it('execute retorna erro se parâmetros inválidos', async () => {
    const registry = createToolRegistry()
    registry.register(echoTool)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await registry.execute('echo', { text: 42 as any })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Invalid parameters')
  })

  it('execute captura exceções da tool e retorna erro', async () => {
    const registry = createToolRegistry()
    registry.register(failTool)
    const result = await registry.execute('fail', { reason: 'test error' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('test error')
  })

  it('execute permite parâmetros opcionais ausentes', async () => {
    const registry = createToolRegistry()
    registry.register(failTool)
    // reason é opcional, mas a tool vai lançar erro de qualquer forma
    const result = await registry.execute('fail', {})
    expect(result.success).toBe(false)
    expect(result.error).toBe('forced failure')
  })
})

describe('getToolLevel / isOrchestratorTool', () => {
  it('getToolLevel retorna level definido', () => {
    expect(getToolLevel(echoTool)).toBe('orchestrator')
  })

  it('getToolLevel retorna orchestrator quando level undefined', () => {
    const tool = defineTool({
      name: 'no-level',
      description: 'Sem level',
      parameters: z.object({}),
      execute: async () => ({ success: true as const }),
    })
    expect(getToolLevel(tool)).toBe('orchestrator')
  })

  it('isOrchestratorTool retorna true para level orchestrator', () => {
    expect(isOrchestratorTool(echoTool)).toBe(true)
  })

  it('isOrchestratorTool retorna false para level agent', () => {
    const agentTool = defineTool({
      name: 'agent-only',
      description: 'Só para agentes',
      parameters: z.object({}),
      execute: async () => ({ success: true as const }),
      level: 'agent',
    })
    expect(isOrchestratorTool(agentTool)).toBe(false)
  })
})
