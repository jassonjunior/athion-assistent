import { describe, expect, it, vi, afterEach } from 'vitest'
import { CodebaseWatcher } from './watcher'
import { createBus } from '../bus/bus'

describe('CodebaseWatcher', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('cria watcher com configuração padrão', () => {
    const bus = createBus()
    const watcher = new CodebaseWatcher({ workspacePath: '/tmp/test', bus })
    expect(watcher.isRunning()).toBe(false)
  })

  it('start/stop alterna estado', () => {
    const bus = createBus()
    const watcher = new CodebaseWatcher({ workspacePath: '/tmp', bus })

    watcher.start()
    expect(watcher.isRunning()).toBe(true)

    watcher.stop()
    expect(watcher.isRunning()).toBe(false)
  })

  it('start duplicado é no-op', () => {
    const bus = createBus()
    const watcher = new CodebaseWatcher({ workspacePath: '/tmp', bus })

    watcher.start()
    watcher.start() // Não deve lançar exceção
    expect(watcher.isRunning()).toBe(true)

    watcher.stop()
  })

  it('stop quando não está rodando é seguro', () => {
    const bus = createBus()
    const watcher = new CodebaseWatcher({ workspacePath: '/tmp', bus })
    watcher.stop() // Não deve lançar exceção
    expect(watcher.isRunning()).toBe(false)
  })

  it('aceita extraIgnoredDirs na configuração', () => {
    const bus = createBus()
    const watcher = new CodebaseWatcher({
      workspacePath: '/tmp',
      bus,
      extraIgnoredDirs: ['vendor', 'coverage'],
    })
    // Não deve lançar exceção
    expect(watcher.isRunning()).toBe(false)
  })

  it('aceita debounceMs customizado', () => {
    const bus = createBus()
    const watcher = new CodebaseWatcher({
      workspacePath: '/tmp',
      bus,
      debounceMs: 500,
    })
    expect(watcher.isRunning()).toBe(false)
  })
})
