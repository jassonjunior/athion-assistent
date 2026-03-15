import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createToolDispatcher } from './tool-dispatcher'
import type { DispatchContext } from './tool-dispatcher'
import type { ToolRegistry } from '../tools/types'
import type { PermissionManager } from '../permissions/types'

function makeTools(): ToolRegistry {
  return {
    register: vi.fn(),
    unregister: vi.fn(),
    get: vi.fn(),
    list: vi.fn(() => []),
    has: vi.fn(() => false),
    execute: vi.fn().mockResolvedValue({ success: true, data: 'ok' }),
  } as unknown as ToolRegistry
}

function makePermissions(): PermissionManager {
  return {
    check: vi.fn(() => ({ decision: 'allow' as const })),
    grant: vi.fn(),
    clearSession: vi.fn(),
    listRules: vi.fn(() => []),
  }
}

function makeCtx(overrides: Partial<DispatchContext> = {}): DispatchContext {
  return {
    sessionId: 'session-1',
    ...overrides,
  }
}

describe('createToolDispatcher', () => {
  let tools: ToolRegistry
  let permissions: PermissionManager

  beforeEach(() => {
    tools = makeTools()
    permissions = makePermissions()
  })

  describe('dispatch', () => {
    it('executa tool quando existe e permissão é allow', async () => {
      ;(tools.get as ReturnType<typeof vi.fn>).mockReturnValue({
        name: 'read_file',
        level: 'agent',
      })

      const dispatcher = createToolDispatcher(tools, permissions)
      const result = await dispatcher.dispatch('read_file', { path: '/test' }, makeCtx())

      expect(result.success).toBe(true)
      expect(tools.execute).toHaveBeenCalledWith('read_file', { path: '/test' })
    })

    it('retorna erro quando tool não existe', async () => {
      ;(tools.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined)

      const dispatcher = createToolDispatcher(tools, permissions)
      const result = await dispatcher.dispatch('nonexistent', {}, makeCtx())

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('nega execução quando permissão é deny', async () => {
      ;(tools.get as ReturnType<typeof vi.fn>).mockReturnValue({
        name: 'write_file',
        level: 'agent',
      })
      ;(permissions.check as ReturnType<typeof vi.fn>).mockReturnValue({
        decision: 'deny',
      })

      const dispatcher = createToolDispatcher(tools, permissions)
      const result = await dispatcher.dispatch('write_file', { path: '/etc/passwd' }, makeCtx())

      expect(result.success).toBe(false)
      expect(result.error).toContain('Permission denied')
    })

    it('solicita permissão via callback quando decision é ask', async () => {
      ;(tools.get as ReturnType<typeof vi.fn>).mockReturnValue({
        name: 'write_file',
        level: 'agent',
      })
      ;(permissions.check as ReturnType<typeof vi.fn>).mockReturnValue({
        decision: 'ask',
      })

      const onPermissionRequest = vi.fn().mockResolvedValue('allow')
      const dispatcher = createToolDispatcher(tools, permissions)
      const result = await dispatcher.dispatch(
        'write_file',
        { path: '/src/test.ts' },
        makeCtx({ onPermissionRequest }),
      )

      expect(onPermissionRequest).toHaveBeenCalledWith('write_file', '/src/test.ts')
      expect(result.success).toBe(true)
    })

    it('nega quando callback de permissão retorna deny', async () => {
      ;(tools.get as ReturnType<typeof vi.fn>).mockReturnValue({
        name: 'run_command',
        level: 'agent',
      })
      ;(permissions.check as ReturnType<typeof vi.fn>).mockReturnValue({
        decision: 'ask',
      })

      const onPermissionRequest = vi.fn().mockResolvedValue('deny')
      const dispatcher = createToolDispatcher(tools, permissions)
      const result = await dispatcher.dispatch(
        'run_command',
        { command: 'rm -rf /' },
        makeCtx({ onPermissionRequest }),
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('Permission denied')
    })

    it('nega quando decision é ask mas sem handler registrado', async () => {
      ;(tools.get as ReturnType<typeof vi.fn>).mockReturnValue({
        name: 'write_file',
        level: 'agent',
      })
      ;(permissions.check as ReturnType<typeof vi.fn>).mockReturnValue({
        decision: 'ask',
      })

      const dispatcher = createToolDispatcher(tools, permissions)
      const result = await dispatcher.dispatch(
        'write_file',
        { path: '/test' },
        makeCtx({ onPermissionRequest: undefined }),
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('No handler registered')
    })

    it('não verifica permissão para tools com level orchestrator', async () => {
      ;(tools.get as ReturnType<typeof vi.fn>).mockReturnValue({
        name: 'task',
        level: 'orchestrator',
      })

      const dispatcher = createToolDispatcher(tools, permissions)
      await dispatcher.dispatch('task', { agent: 'coder' }, makeCtx())

      expect(permissions.check).not.toHaveBeenCalled()
      expect(tools.execute).toHaveBeenCalled()
    })

    it('retorna erro quando signal está abortado', async () => {
      ;(tools.get as ReturnType<typeof vi.fn>).mockReturnValue({
        name: 'read_file',
        level: 'orchestrator',
      })

      const controller = new AbortController()
      controller.abort()

      const dispatcher = createToolDispatcher(tools, permissions)
      const result = await dispatcher.dispatch(
        'read_file',
        { path: '/test' },
        makeCtx({ signal: controller.signal }),
      )

      expect(result.success).toBe(false)
      expect(result.error).toContain('aborted')
    })

    it('extrai path como target para verificação de permissão', async () => {
      ;(tools.get as ReturnType<typeof vi.fn>).mockReturnValue({
        name: 'read_file',
        level: 'agent',
      })

      const dispatcher = createToolDispatcher(tools, permissions)
      await dispatcher.dispatch('read_file', { path: '/src/index.ts' }, makeCtx())

      expect(permissions.check).toHaveBeenCalledWith('read_file', '/src/index.ts')
    })

    it('extrai command como target para run_command', async () => {
      ;(tools.get as ReturnType<typeof vi.fn>).mockReturnValue({
        name: 'run_command',
        level: 'agent',
      })

      const dispatcher = createToolDispatcher(tools, permissions)
      await dispatcher.dispatch('run_command', { command: 'npm test' }, makeCtx())

      expect(permissions.check).toHaveBeenCalledWith('run_command', 'npm test')
    })

    it('usa "*" como target quando args não têm campos conhecidos', async () => {
      ;(tools.get as ReturnType<typeof vi.fn>).mockReturnValue({
        name: 'custom_tool',
        level: 'agent',
      })

      const dispatcher = createToolDispatcher(tools, permissions)
      await dispatcher.dispatch('custom_tool', { foo: 'bar' }, makeCtx())

      expect(permissions.check).toHaveBeenCalledWith('custom_tool', '*')
    })

    it('usa "*" como target quando args é null/undefined', async () => {
      ;(tools.get as ReturnType<typeof vi.fn>).mockReturnValue({
        name: 'custom_tool',
        level: 'agent',
      })

      const dispatcher = createToolDispatcher(tools, permissions)
      await dispatcher.dispatch('custom_tool', null, makeCtx())

      expect(permissions.check).toHaveBeenCalledWith('custom_tool', '*')
    })
  })
})
