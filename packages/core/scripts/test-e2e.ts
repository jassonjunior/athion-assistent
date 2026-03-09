import { resolve } from 'node:path'
import { bootstrap } from '../src/bootstrap'
import { createVllmManager } from '../src/server/vllm-manager'

const DIVIDER = '═'.repeat(60)
const LINE = '─'.repeat(60)

function print(msg: string): void {
  console.log(msg)
}

async function main() {
  print(DIVIDER)
  print('  ATHION E2E TEST')
  print(DIVIDER)

  // 1. Garantir vllm-mlx no ar
  print('\n[1/4] Ensuring vllm-mlx is running...')
  const vllm = createVllmManager()
  await vllm.ensureRunning()
  print(`  ✓ vllm-mlx online at ${vllm.baseUrl}`)

  // 2. Bootstrap
  print('\n[2/4] Bootstrapping Athion core...')
  const core = await bootstrap({
    dbPath: '/tmp/athion-e2e-test.db',
    skillsDir: resolve(import.meta.dir, '../skills'),
  })
  print(
    `  ✓ Tools: ${core.tools
      .list()
      .map((t) => t.name)
      .join(', ')}`,
  )
  print(
    `  ✓ Skills: ${core.skills
      .list()
      .map((s) => s.name)
      .join(', ')}`,
  )
  print(
    `  ✓ SubAgents: ${core.subagents
      .list()
      .map((a) => a.name)
      .join(', ')}`,
  )
  print(`  ✓ Proxy: ${core.proxy ? core.proxy.url : 'disabled'}`)

  // 3. Criar sessao
  print('\n[3/4] Creating session...')
  const session = await core.orchestrator.createSession('e2e-test', 'E2E Test Session')
  print(`  ✓ Session: ${session.id}`)

  // 4. Chat streaming
  const userMessage = 'Ola! Me diga seu nome e o que voce sabe fazer.'
  print('\n[4/4] Chat streaming test')
  print(DIVIDER)

  const startTime = Date.now()
  const stream = core.orchestrator.chat(session.id, { content: userMessage })

  let counter = 0
  let fullContent = ''

  print(`[${counter}] user: ${userMessage}`)
  counter++

  for await (const event of stream) {
    switch (event.type) {
      case 'content':
        fullContent += event.content
        break
      case 'tool_call':
        print(`[${counter}] tool_call: ${event.name}(${JSON.stringify(event.args).slice(0, 200)})`)
        counter++
        break
      case 'tool_result': {
        const status = event.result.success ? 'OK' : `ERROR: ${event.result.error}`
        const data = event.result.success ? JSON.stringify(event.result.data).slice(0, 200) : ''
        print(`[${counter}] tool_result: ${event.name} → ${status}${data ? ` | ${data}` : ''}`)
        counter++
        break
      }
      case 'finish': {
        // Flush conteudo acumulado do assistant
        if (fullContent) {
          print(`[${counter}] assistant: ${fullContent}`)
          counter++
        }
        const elapsed = Date.now() - startTime
        print(
          `[${counter}] finish: ${event.usage.promptTokens} in / ${event.usage.completionTokens} out | ${(elapsed / 1000).toFixed(1)}s`,
        )
        counter++
        break
      }
      case 'error':
        print(`[${counter}] error: ${event.error.message}`)
        counter++
        break
    }
  }

  // Cleanup
  vllm.stop()
  print(LINE)
  print(`Total events: ${counter}`)
  print(`Content length: ${fullContent.length} chars`)
  print(DIVIDER)
  print('  E2E TEST COMPLETE')
  print(DIVIDER)
  print('\nLog MITM: tail -f ~/.athion/logs/proxy.log')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
