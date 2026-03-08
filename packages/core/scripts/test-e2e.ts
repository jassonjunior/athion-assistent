import { resolve } from 'node:path'
import { bootstrap } from '../src/bootstrap'
import { createVllmManager } from '../src/server/vllm-manager'

/**
 * Teste E2E: vllm-manager -> bootstrap -> orchestrator -> streaming
 */
async function main() {
  console.log('=== Athion E2E Test ===\n')

  // BREAKPOINT 1: VllmManager — garantir que o servidor esta no ar
  console.log('Ensuring vllm-mlx is running...')
  const vllm = createVllmManager()
  debugger // Inspecionar: vllm.baseUrl
  await vllm.ensureRunning()
  console.log(`vllm-mlx is online at ${vllm.baseUrl}\n`)

  // BREAKPOINT 2: Bootstrap — validar se todos os modulos inicializam
  console.log('Bootstrapping Athion core...')
  const core = await bootstrap({
    dbPath: '/tmp/athion-e2e-test.db',
    skillsDir: resolve(import.meta.dir, '../skills'),
  })
  debugger // Inspecionar: core.tools, core.skills, core.subagents, core.orchestrator

  console.log('Bootstrap complete.')
  console.log(
    `  Tools: ${core.tools
      .list()
      .map((t) => t.name)
      .join(', ')}`,
  )
  console.log(
    `  Skills: ${core.skills
      .list()
      .map((s) => s.name)
      .join(', ')}`,
  )
  console.log(
    `  SubAgents: ${core.subagents
      .list()
      .map((a) => a.name)
      .join(', ')}`,
  )
  console.log()

  // BREAKPOINT 3: Criar sessao
  const session = await core.orchestrator.createSession('e2e-test', 'E2E Test Session')
  debugger // Inspecionar: session.id, session.projectId, session.title
  console.log(`Session created: ${session.id}\n`)

  // BREAKPOINT 4: Enviar mensagem
  const userMessage = 'Ola! Me diga seu nome e o que voce sabe fazer.'
  console.log(`User: ${userMessage}\n`)
  console.log('Assistant: ')

  const startTime = Date.now()
  const stream = core.orchestrator.chat(session.id, { content: userMessage })
  debugger // Inspecionar: stream (deve ser AsyncGenerator)

  // BREAKPOINT 5: Consumir streaming
  let eventCount = 0
  for await (const event of stream) {
    eventCount++

    if (eventCount === 1) {
      debugger // Inspecionar: primeiro evento
    }

    switch (event.type) {
      case 'content':
        process.stdout.write(event.content)
        break
      case 'tool_call':
        debugger
        console.log(`\n[Tool Call] ${event.name}(${JSON.stringify(event.args)})`)
        break
      case 'tool_result':
        debugger
        console.log(
          `[Tool Result] ${event.name}: ${event.result.success ? 'OK' : event.result.error}`,
        )
        break
      case 'finish':
        debugger
        console.log('\n\n--- Finished ---')
        console.log(`Tokens: ${event.usage.promptTokens} in / ${event.usage.completionTokens} out`)
        console.log(`Time: ${Date.now() - startTime}ms`)
        console.log(`Events received: ${eventCount}`)
        break
      case 'error':
        debugger
        console.error(`\n[Error] ${event.error.message}`)
        break
    }
  }

  vllm.stop()
  console.log('\n=== E2E Test Complete ===')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
