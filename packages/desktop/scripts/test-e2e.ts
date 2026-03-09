/**
 * Teste E2E do Athion Desktop — simula o pipeline completo.
 *
 * Reproduz o que o Rust SidecarManager faz:
 * 1. Spawna bun serve --mode=stdio (sidecar)
 * 2. Testa todos os commands que o Tauri invocaria
 * 3. Verifica chat streaming com modelo real
 *
 * Equivalente a testar: React → Rust → sidecar → core
 * (sem o Rust, testamos diretamente: test → sidecar → core)
 */

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const DIVIDER = '═'.repeat(60)
const LINE = '─'.repeat(60)
const print = (msg: string): void => console.log(msg)

interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: number
  method?: string
  result?: unknown
  error?: { code: number; message: string }
  params?: unknown
}

// ─── JSON-RPC Client ────────────────────────────────────────────

function createClient(cliPath: string) {
  const messages: JsonRpcMessage[] = []
  let buffer = ''

  const proc = spawn('bun', [cliPath, 'serve', '--mode=stdio'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1' },
  })

  proc.stderr?.setEncoding('utf-8')
  proc.stderr?.on('data', (chunk: string) => {
    for (const line of chunk.split('\n').filter(Boolean)) {
      print(`  [sidecar] ${line}`)
    }
  })

  proc.stdout?.setEncoding('utf-8')
  proc.stdout?.on('data', (chunk: string) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        messages.push(JSON.parse(line) as JsonRpcMessage)
      } catch {
        /* skip */
      }
    }
  })

  let nextId = 1

  function send(method: string, params?: unknown): number {
    const id = nextId++
    proc.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
    return id
  }

  function waitResponse(id: number, ms = 15000): Promise<JsonRpcMessage> {
    return new Promise((resolve, reject) => {
      const start = Date.now()
      const iv = setInterval(() => {
        const found = messages.find((m) => m.id === id)
        if (found) {
          clearInterval(iv)
          resolve(found)
        } else if (Date.now() - start > ms) {
          clearInterval(iv)
          reject(new Error(`Timeout id=${id}`))
        }
      }, 50)
    })
  }

  function waitNotification(method: string, type: string, ms = 60000): Promise<JsonRpcMessage> {
    return new Promise((resolve, reject) => {
      const start = Date.now()
      const iv = setInterval(() => {
        const found = messages.find(
          (m) => m.method === method && (m.params as { type?: string })?.type === type,
        )
        if (found) {
          clearInterval(iv)
          resolve(found)
        } else if (Date.now() - start > ms) {
          clearInterval(iv)
          reject(new Error(`Timeout ${method}:${type}`))
        }
      }, 50)
    })
  }

  function getNotifications(method: string, type: string): JsonRpcMessage[] {
    return messages.filter(
      (m) => m.method === method && (m.params as { type?: string })?.type === type,
    )
  }

  function kill(): void {
    proc.kill('SIGTERM')
  }

  return { send, waitResponse, waitNotification, getNotifications, messages, kill }
}

// ─── Test Runner ────────────────────────────────────────────────

interface TestResult {
  label: string
  ok: boolean
  detail?: string
}

async function main() {
  print(DIVIDER)
  print('  ATHION DESKTOP E2E — Sidecar Pipeline')
  print(DIVIDER)

  const cliPath = resolve(import.meta.dir, '../../cli/src/index.ts')
  print('\n[1/8] Spawning sidecar (bun serve --mode=stdio)...')
  const client = createClient(cliPath)

  await new Promise((r) => setTimeout(r, 2000))

  const results: TestResult[] = []

  // ─── Test 1: Ping ───────────────────────────────────────────
  print('\n[2/8] Testing ping...')
  try {
    const id = client.send('ping')
    const resp = await client.waitResponse(id)
    const pong = (resp.result as { pong: boolean })?.pong
    results.push({ label: 'ping → pong', ok: !!pong, detail: JSON.stringify(resp.result) })
    print(`  ✓ ${JSON.stringify(resp.result)}`)
  } catch (e) {
    results.push({ label: 'ping → pong', ok: false, detail: String(e) })
    print(`  ✗ ${e}`)
  }

  // ─── Test 2: Session Create ─────────────────────────────────
  print('\n[3/8] Testing session.create...')
  let sessionId = ''
  try {
    const id = client.send('session.create', { projectId: 'e2e-desktop', title: 'Desktop E2E' })
    const resp = await client.waitResponse(id)
    sessionId = (resp.result as { id: string })?.id ?? ''
    results.push({ label: 'session.create', ok: !!sessionId, detail: sessionId })
    print(`  ✓ Session: ${sessionId}`)
  } catch (e) {
    results.push({ label: 'session.create', ok: false, detail: String(e) })
    print(`  ✗ ${e}`)
  }

  // ─── Test 3: Session List ───────────────────────────────────
  print('\n[4/8] Testing session.list...')
  try {
    const id = client.send('session.list', { projectId: 'e2e-desktop' })
    const resp = await client.waitResponse(id)
    const sessions = resp.result as unknown[]
    results.push({
      label: 'session.list',
      ok: sessions.length > 0,
      detail: `${sessions.length} sessions`,
    })
    print(`  ✓ ${sessions.length} session(s)`)
  } catch (e) {
    results.push({ label: 'session.list', ok: false, detail: String(e) })
    print(`  ✗ ${e}`)
  }

  // ─── Test 4: Config ─────────────────────────────────────────
  print('\n[5/8] Testing config.list...')
  try {
    const id = client.send('config.list')
    const resp = await client.waitResponse(id)
    const config = resp.result as Record<string, unknown>
    const hasModel = 'model' in config
    results.push({ label: 'config.list', ok: hasModel, detail: `model=${config.model}` })
    print(`  ✓ model=${config.model}, provider=${config.provider}`)
  } catch (e) {
    results.push({ label: 'config.list', ok: false, detail: String(e) })
    print(`  ✗ ${e}`)
  }

  // ─── Test 5: Tools List ─────────────────────────────────────
  print('\n[6/8] Testing tools.list...')
  try {
    const id = client.send('tools.list')
    const resp = await client.waitResponse(id)
    const tools = resp.result as unknown[]
    results.push({ label: 'tools.list', ok: tools.length > 0, detail: `${tools.length} tools` })
    print(`  ✓ ${tools.length} tool(s)`)
  } catch (e) {
    results.push({ label: 'tools.list', ok: false, detail: String(e) })
    print(`  ✗ ${e}`)
  }

  // ─── Test 6: Agents List ────────────────────────────────────
  print('\n[7/8] Testing agents.list...')
  try {
    const id = client.send('agents.list')
    const resp = await client.waitResponse(id)
    const agents = resp.result as unknown[]
    results.push({ label: 'agents.list', ok: agents.length > 0, detail: `${agents.length} agents` })
    print(`  ✓ ${agents.length} agent(s)`)
  } catch (e) {
    results.push({ label: 'agents.list', ok: false, detail: String(e) })
    print(`  ✗ ${e}`)
  }

  // ─── Test 7: Chat with Model (streaming) ────────────────────
  print('\n[8/8] Testing chat.send with model (streaming)...')
  if (sessionId) {
    try {
      const startTime = Date.now()
      const id = client.send('chat.send', {
        sessionId,
        content: 'Responda exatamente: "Olá, Desktop!" e nada mais.',
      })

      const finishNotif = await client.waitNotification('chat.event', 'finish', 60000)
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

      const contentEvents = client.getNotifications('chat.event', 'content')
      const fullContent = contentEvents
        .map((m) => (m.params as { content: string }).content)
        .join('')

      const chatResp = await client.waitResponse(id)
      const chatOk = (chatResp.result as { ok: boolean })?.ok
      const hasErrors = client.getNotifications('chat.event', 'error').length > 0

      results.push({
        label: 'chat streaming',
        ok: contentEvents.length > 0,
        detail: `${contentEvents.length} chunks`,
      })
      results.push({ label: 'chat finish event', ok: !!finishNotif, detail: `${elapsed}s` })
      results.push({ label: 'chat response ok', ok: !!chatOk })
      results.push({ label: 'chat no errors', ok: !hasErrors })
      results.push({
        label: 'chat content received',
        ok: fullContent.length > 0,
        detail: `"${fullContent.slice(0, 100)}"`,
      })

      print(`  ✓ Finish in ${elapsed}s`)
      print(
        `  ✓ Content (${contentEvents.length} chunks, ${fullContent.length} chars): "${fullContent.slice(0, 100)}"`,
      )
      print(`  ✓ Response: ${JSON.stringify(chatResp.result)}`)
    } catch (e) {
      results.push({ label: 'chat.send', ok: false, detail: String(e) })
      print(`  ✗ ${e}`)
    }
  } else {
    results.push({ label: 'chat.send', ok: false, detail: 'No session' })
    print('  ✗ Skipped (no session)')
  }

  // ─── Summary ────────────────────────────────────────────────
  print(`\n${LINE}`)
  print('  RESULTS')
  print(LINE)

  let allPassed = true
  for (const r of results) {
    const icon = r.ok ? '✓' : '✗'
    const detail = r.detail ? ` (${r.detail})` : ''
    print(`  ${icon} ${r.label}${detail}`)
    if (!r.ok) allPassed = false
  }

  print(LINE)
  print(`  Total checks: ${results.length}`)
  print(`  Passed: ${results.filter((r) => r.ok).length}`)
  print(`  Failed: ${results.filter((r) => !r.ok).length}`)
  print(DIVIDER)
  print(`  DESKTOP E2E ${allPassed ? 'PASSED ✓' : 'FAILED ✗'}`)
  print(DIVIDER)

  client.kill()
  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
