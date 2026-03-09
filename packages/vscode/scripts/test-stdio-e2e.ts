/**
 * Teste E2E do servidor JSON-RPC stdio.
 *
 * Simula o que a extensão VS Code faz:
 * 1. Spawna bun serve --mode=stdio
 * 2. Envia ping
 * 3. Cria sessão
 * 4. Envia chat.send e coleta notificações
 * 5. Verifica se recebeu content e finish
 */

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const DIVIDER = '═'.repeat(60)
const LINE = '─'.repeat(60)

function print(msg: string): void {
  console.log(msg)
}

interface JsonRpcMessage {
  jsonrpc: '2.0'
  id?: number
  method?: string
  result?: unknown
  error?: { code: number; message: string }
  params?: unknown
}

async function main() {
  print(DIVIDER)
  print('  ATHION VSCODE E2E — JSON-RPC stdio')
  print(DIVIDER)

  // 1. Spawn server
  print('\n[1/5] Spawning bun serve --mode=stdio...')
  const cliPath = resolve(import.meta.dir, '../../cli/src/index.ts')

  const proc = spawn('bun', [cliPath, 'serve', '--mode=stdio'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NO_COLOR: '1' },
  })

  proc.stderr?.setEncoding('utf-8')
  proc.stderr?.on('data', (chunk: string) => {
    for (const line of chunk.split('\n').filter(Boolean)) {
      print(`  [stderr] ${line}`)
    }
  })

  // Collect responses/notifications
  const messages: JsonRpcMessage[] = []
  let buffer = ''

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
        print(`  [stdout non-json] ${line}`)
      }
    }
  })

  function send(msg: JsonRpcMessage): void {
    proc.stdin?.write(JSON.stringify(msg) + '\n')
  }

  function waitForResponse(id: number, timeoutMs = 15000): Promise<JsonRpcMessage> {
    return new Promise((resolve, reject) => {
      const start = Date.now()
      const check = setInterval(() => {
        const found = messages.find((m) => m.id === id)
        if (found) {
          clearInterval(check)
          resolve(found)
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(check)
          reject(new Error(`Timeout waiting for response id=${id}`))
        }
      }, 50)
    })
  }

  function waitForNotification(
    method: string,
    type: string,
    timeoutMs = 60000,
  ): Promise<JsonRpcMessage> {
    return new Promise((resolve, reject) => {
      const start = Date.now()
      const check = setInterval(() => {
        const found = messages.find(
          (m) => m.method === method && (m.params as { type?: string })?.type === type,
        )
        if (found) {
          clearInterval(check)
          resolve(found)
        } else if (Date.now() - start > timeoutMs) {
          clearInterval(check)
          reject(new Error(`Timeout waiting for notification ${method}:${type}`))
        }
      }, 50)
    })
  }

  // Give server time to bootstrap
  await new Promise((r) => setTimeout(r, 2000))

  // 2. Ping
  print('\n[2/5] Sending ping...')
  send({ jsonrpc: '2.0', id: 1, method: 'ping' })
  const pingResp = await waitForResponse(1)
  print(`  ✓ Pong: ${JSON.stringify(pingResp.result)}`)

  // 3. Create session
  print('\n[3/5] Creating session...')
  send({
    jsonrpc: '2.0',
    id: 2,
    method: 'session.create',
    params: { projectId: 'e2e-vscode', title: 'E2E Test' },
  })
  const sessionResp = await waitForResponse(2)
  const session = sessionResp.result as { id: string }
  print(`  ✓ Session: ${session.id}`)

  // 4. Chat
  print('\n[4/5] Sending chat message...')
  const startTime = Date.now()
  send({
    jsonrpc: '2.0',
    id: 3,
    method: 'chat.send',
    params: { sessionId: session.id, content: 'Diga "Olá, VS Code!" e nada mais.' },
  })

  // Wait for finish notification
  print('  Waiting for streaming events...')
  const finishNotif = await waitForNotification('chat.event', 'finish', 60000)
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  print(`  ✓ Finish received in ${elapsed}s`)

  // Collect all content
  const contentEvents = messages.filter(
    (m) => m.method === 'chat.event' && (m.params as { type?: string })?.type === 'content',
  )
  const fullContent = contentEvents.map((m) => (m.params as { content: string }).content).join('')

  print(`  ✓ Content: "${fullContent.slice(0, 200)}"`)

  // Wait for chat.send response
  const chatResp = await waitForResponse(3)
  print(`  ✓ Response: ${JSON.stringify(chatResp.result)}`)

  // 5. Validation
  print(`\n[5/5] Validation`)
  print(LINE)

  const checks = [
    { label: 'Ping responded', ok: !!(pingResp.result as { pong: boolean })?.pong },
    { label: 'Session created', ok: !!session.id },
    { label: 'Content received', ok: contentEvents.length > 0 },
    { label: 'Finish event received', ok: !!finishNotif },
    { label: 'Chat completed', ok: !!(chatResp.result as { ok: boolean })?.ok },
    {
      label: 'No errors',
      ok: !messages.some((m) => (m.params as { type?: string })?.type === 'error'),
    },
  ]

  let allPassed = true
  for (const check of checks) {
    const icon = check.ok ? '✓' : '✗'
    print(`  ${icon} ${check.label}`)
    if (!check.ok) allPassed = false
  }

  print(LINE)
  print(`  Total events: ${messages.length}`)
  print(`  Content chunks: ${contentEvents.length}`)
  print(`  Content length: ${fullContent.length} chars`)
  print(DIVIDER)
  print(`  E2E TEST ${allPassed ? 'PASSED ✓' : 'FAILED ✗'}`)
  print(DIVIDER)

  // Cleanup
  proc.kill('SIGTERM')
  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
