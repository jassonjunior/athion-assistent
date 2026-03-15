import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

let tempHome: string

// Mock homedir() para apontar para dir temporário
vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>()
  return {
    ...original,
    homedir: () => tempHome,
  }
})

describe('WorkspaceRegistry', () => {
  beforeEach(() => {
    tempHome = mkdtempSync(join(tmpdir(), 'athion-ws-test-'))
    mkdirSync(join(tempHome, '.athion'), { recursive: true })
    // Limpa cache do módulo para recalcular ATHION_DIR
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true })
  })

  async function createRegistry() {
    const mod = await import('./workspace-registry.js')
    return new mod.WorkspaceRegistry()
  }

  it('começa vazio quando não há arquivo de persistência', async () => {
    const registry = await createRegistry()
    expect(registry.list()).toEqual([])
    expect(registry.count()).toBe(0)
  })

  it('add() registra workspace e persiste', async () => {
    const registry = await createRegistry()
    const ws = registry.add('/tmp/projeto-a', 'Projeto A')

    expect(ws.id).toHaveLength(8)
    expect(ws.name).toBe('Projeto A')
    expect(ws.path).toBe('/tmp/projeto-a')
    expect(ws.isActive).toBe(true)
    expect(ws.indexDbPath).toContain('index-')
    expect(registry.count()).toBe(1)
  })

  it('add() retorna existente se path já registrado', async () => {
    const registry = await createRegistry()
    const ws1 = registry.add('/tmp/projeto-a', 'A')
    const ws2 = registry.add('/tmp/projeto-a', 'B')

    expect(ws1.id).toBe(ws2.id)
    expect(registry.count()).toBe(1)
  })

  it('add() gera nome a partir do path se não informado', async () => {
    const registry = await createRegistry()
    const ws = registry.add('/tmp/meu-projeto')

    expect(ws.name).toBe('meu-projeto')
  })

  it('get() busca por ID', async () => {
    const registry = await createRegistry()
    const ws = registry.add('/tmp/projeto-a', 'A')

    expect(registry.get(ws.id)).toBeDefined()
    expect(registry.get(ws.id)?.name).toBe('A')
    expect(registry.get('inexistente')).toBeUndefined()
  })

  it('getByPath() busca por path', async () => {
    const registry = await createRegistry()
    registry.add('/tmp/projeto-a', 'A')

    expect(registry.getByPath('/tmp/projeto-a')).toBeDefined()
    expect(registry.getByPath('/tmp/outro')).toBeUndefined()
  })

  it('remove() remove workspace', async () => {
    const registry = await createRegistry()
    const ws = registry.add('/tmp/projeto-a')

    expect(registry.remove(ws.id)).toBe(true)
    expect(registry.count()).toBe(0)
    expect(registry.remove('inexistente')).toBe(false)
  })

  it('setActive() ativa/desativa workspace', async () => {
    const registry = await createRegistry()
    const ws = registry.add('/tmp/projeto-a')

    registry.setActive(ws.id, false)
    expect(registry.get(ws.id)?.isActive).toBe(false)

    registry.setActive(ws.id, true)
    expect(registry.get(ws.id)?.isActive).toBe(true)
  })

  it('activeWorkspaces() retorna apenas ativos', async () => {
    const registry = await createRegistry()
    registry.add('/tmp/a', 'A')
    const wsB = registry.add('/tmp/b', 'B')
    registry.setActive(wsB.id, false)

    const active = registry.activeWorkspaces()
    expect(active).toHaveLength(1)
    expect(active[0]?.name).toBe('A')
  })

  it('addRemote() registra workspace com info remota', async () => {
    const registry = await createRegistry()
    const ws = registry.addRemote(
      '/tmp/remote-repo',
      { url: 'https://github.com/user/repo', branch: 'main', lastSynced: '2026-01-01' },
      'Remote Repo',
    )

    expect(ws.remote).toBeDefined()
    expect(ws.remote?.url).toBe('https://github.com/user/repo')
    expect(ws.remote?.branch).toBe('main')
  })

  it('updateLastIndexed() atualiza timestamp', async () => {
    const registry = await createRegistry()
    const ws = registry.add('/tmp/projeto-a')
    const before = ws.lastIndexed

    await new Promise((r) => setTimeout(r, 10))
    registry.updateLastIndexed(ws.id)

    const updated = registry.get(ws.id)
    expect(updated?.lastIndexed).not.toBe(before)
  })

  it('respeita limite máximo de 5 workspaces', async () => {
    const registry = await createRegistry()

    for (let i = 0; i < 5; i++) {
      registry.add(`/tmp/ws-${i}`)
    }

    expect(() => registry.add('/tmp/ws-extra')).toThrow('Maximum 5 workspaces')
  })
})
