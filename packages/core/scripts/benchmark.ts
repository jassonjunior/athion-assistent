#!/usr/bin/env bun
/**
 * Benchmarks de performance do Athion Core.
 *
 * Mede:
 * - Bus publish/subscribe (throughput de eventos)
 * - ToolRegistry register/lookup
 * - TokenManager trackUsage + needsCompaction
 * - TokenManager compact (sliding-window)
 * - PermissionManager check (session rules)
 * - DatabaseManager CRUD (in-memory)
 * - SkillParser parse
 * - ConfigManager get
 */

import { createBus, defineBusEvent } from '../src/bus/bus'
import { createTokenManager } from '../src/tokens/manager'
import { createToolRegistry, defineTool } from '../src/tools/registry'
import { createConfigManager } from '../src/config/config'
import { createDatabaseManager } from '../src/storage/db'
import { z } from 'zod'

const ITERATIONS = 10_000

function bench(name: string, fn: () => void, iterations = ITERATIONS): void {
  // warmup
  for (let i = 0; i < 100; i++) fn()

  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  const elapsed = performance.now() - start

  const opsPerSec = Math.round((iterations / elapsed) * 1000)
  const avgUs = ((elapsed / iterations) * 1000).toFixed(2)
  console.log(
    `  ${name.padEnd(45)} ${opsPerSec.toLocaleString().padStart(12)} ops/s   avg ${avgUs}μs`,
  )
}

async function benchAsync(name: string, fn: () => Promise<void>, iterations = 1000): Promise<void> {
  // warmup
  for (let i = 0; i < 10; i++) await fn()

  const start = performance.now()
  for (let i = 0; i < iterations; i++) await fn()
  const elapsed = performance.now() - start

  const opsPerSec = Math.round((iterations / elapsed) * 1000)
  const avgMs = (elapsed / iterations).toFixed(3)
  console.log(
    `  ${name.padEnd(45)} ${opsPerSec.toLocaleString().padStart(12)} ops/s   avg ${avgMs}ms`,
  )
}

// ─── Bus ─────────────────────────────────────────────────────────────────────

console.log('\n📊 Bus (pub/sub):')
{
  const TestEvent = defineBusEvent('bench.test', z.object({ value: z.number() }))
  const bus = createBus()
  bus.subscribe(TestEvent, () => undefined)

  bench('bus.publish (1 subscriber)', () => {
    bus.publish(TestEvent, { value: 42 })
  })

  const bus2 = createBus()
  for (let i = 0; i < 10; i++) bus2.subscribe(TestEvent, () => undefined)
  bench('bus.publish (10 subscribers)', () => {
    bus2.publish(TestEvent, { value: 42 })
  })
}

// ─── TokenManager ────────────────────────────────────────────────────────────

console.log('\n📊 TokenManager:')
{
  const tm = createTokenManager({ contextLimit: 100_000 })
  bench('tokenManager.trackUsage', () => {
    tm.trackUsage(100, 50)
  })

  const tm2 = createTokenManager({ contextLimit: 100_000, compactionThreshold: 0.8 })
  bench('tokenManager.needsCompaction', () => {
    tm2.needsCompaction()
  })

  const messages = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Mensagem de teste número ${i} com conteúdo suficiente para ser realista`,
  }))
  await benchAsync(
    'tokenManager.compact (sliding-window, 30 msgs)',
    async () => {
      await tm.compact(messages)
    },
    5000,
  )

  const actions = ['read_file', 'write_file', 'read_file', 'write_file', 'read_file']
  bench('tokenManager.detectLoop (5 actions)', () => {
    tm.detectLoop(actions)
  })
}

// ─── ToolRegistry ─────────────────────────────────────────────────────────────

console.log('\n📊 ToolRegistry:')
{
  const registry = createToolRegistry()
  const tool = defineTool({
    name: 'bench_tool',
    description: 'Benchmark tool',
    parameters: z.object({ text: z.string() }),
    execute: async () => ({ success: true as const }),
  })
  registry.register(tool)

  bench('toolRegistry.get (hit)', () => {
    registry.get('bench_tool')
  })

  bench('toolRegistry.get (miss)', () => {
    registry.get('nonexistent')
  })

  bench('toolRegistry.list (1 tool)', () => {
    registry.list()
  })

  await benchAsync(
    'toolRegistry.execute (success)',
    async () => {
      await registry.execute('bench_tool', { text: 'hello' })
    },
    5000,
  )
}

// ─── ConfigManager ────────────────────────────────────────────────────────────

console.log('\n📊 ConfigManager:')
{
  const config = createConfigManager({ provider: 'vllm-mlx' })
  bench('configManager.get', () => {
    config.get('provider')
  })
  bench('configManager.getAll', () => {
    config.getAll()
  })
  bench('configManager.set (same value)', () => {
    config.set('provider', 'vllm-mlx')
  })
}

// ─── DatabaseManager ─────────────────────────────────────────────────────────

console.log('\n📊 DatabaseManager (:memory:):')
{
  const db = createDatabaseManager(':memory:')

  bench(
    'db.createSession',
    () => {
      db.createSession('bench-project', 'Benchmark Session')
    },
    1000,
  )

  const session = db.createSession('bench-proj', 'Bench')
  bench(
    'db.getSession (hit)',
    () => {
      db.getSession(session.id)
    },
    1000,
  )

  bench(
    'db.getSession (miss)',
    () => {
      db.getSession('not-found-id')
    },
    1000,
  )

  bench(
    'db.addMessage',
    () => {
      db.addMessage(session.id, {
        role: 'user',
        parts: [{ type: 'text', text: 'Benchmark message' }],
      })
    },
    1000,
  )

  db.close()
}

// ─── Targets ────────────────────────────────────────────────────────────────

console.log('\n🎯 Targets de performance:')
console.log(
  '  CLI startup          < 200ms  (medido com: time bun run packages/cli/src/index.ts --version)',
)
console.log('  Desktop startup      < 500ms  (medido no Activity Monitor)')
console.log('  Tool execution local < 200ms  (medido nos benchmarks acima)')
console.log('  Memory CLI idle      < 50MB   (medido com: ps aux | grep athion)')
console.log('')
