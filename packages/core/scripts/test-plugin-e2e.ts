/**
 * E2E Test: Plugin System com LLM
 *
 * Carrega o plugin hello-world, faz bootstrap completo com vllm-mlx,
 * e valida que o modelo consegue descobrir e chamar a tool `greet` do plugin.
 */

import { resolve } from 'node:path'
import { bootstrap } from '../src/bootstrap'
import { createVllmManager } from '../src/server/vllm-manager'
import helloWorldPlugin from '../src/plugins/examples/hello-world/index'

const DIVIDER = '═'.repeat(60)
const LINE = '─'.repeat(60)

function print(msg: string) {
  console.log(msg)
}

async function main() {
  print(DIVIDER)
  print('  PLUGIN E2E — LLM + hello-world plugin')
  print(DIVIDER)

  // ── 1. Start vllm-mlx ────────────────────────────────────
  print('\n[1/4] Iniciando vllm-mlx...')
  const vllm = createVllmManager()
  await vllm.ensureRunning()
  print(`  ✓ vllm-mlx online em ${vllm.baseUrl}`)

  // ── 2. Bootstrap core ─────────────────────────────────────
  print('[2/4] Bootstrap do core...')
  const core = await bootstrap({
    dbPath: '/tmp/athion-e2e-plugin.db',
    skillsDir: resolve(import.meta.dir, '../skills'),
  })

  // ── 3. Load plugin hello-world ────────────────────────────
  print('[3/4] Carregando plugin hello-world...')
  await core.plugins.load(helloWorldPlugin)

  const pluginTools = core.plugins.get('hello-world')?.registeredTools ?? []
  print(`  ✓ Plugin carregado — tools: ${pluginTools.join(', ')}`)

  // Verifica que a tool greet aparece no registry global
  const greetTool = core.tools.get('greet')
  if (!greetTool) {
    print('  ✗ Tool greet NÃO encontrada no registry — abortando')
    vllm.stop()
    process.exit(1)
  }
  print(`  ✓ Tool greet visível no registry (${core.tools.list().length} tools total)`)

  // Lista todas as tools para ver o que o modelo vai receber
  print(
    `  Tools disponíveis: ${core.tools
      .list()
      .map((t) => t.name)
      .join(', ')}`,
  )

  // ── 4. Chat com o modelo ──────────────────────────────────
  print('\n[4/4] Enviando mensagem ao modelo...')
  print(LINE)

  const session = await core.orchestrator.createSession('e2e-plugin', 'Plugin E2E Test')
  print(`  Session: ${session.id}`)

  const userMessage = 'Please greet Jasson in Portuguese using the greet tool.'
  print(`  User: ${userMessage}`)
  print(LINE)

  const stream = core.orchestrator.chat(session.id, { content: userMessage })

  const toolCalls: Array<{ name: string; args: unknown }> = []
  const toolResults: Array<{ name: string; success: boolean; preview?: string }> = []
  let content = ''
  let hasFinish = false
  const errors: string[] = []
  let counter = 0

  const startTime = Date.now()

  for await (const event of stream) {
    counter++
    switch (event.type) {
      case 'content':
        content += event.content
        break
      case 'tool_call':
        print(
          `  [${counter}] tool_call: ${event.name}(${JSON.stringify(event.args).slice(0, 200)})`,
        )
        toolCalls.push({ name: event.name, args: event.args })
        break
      case 'tool_result': {
        const ok = event.result.success ? 'OK' : `ERROR: ${event.result.error}`
        const preview = event.result.success ? JSON.stringify(event.result.data).slice(0, 200) : ''
        print(`  [${counter}] tool_result: ${event.name} → ${ok} ${preview}`)
        toolResults.push({
          name: event.name,
          success: event.result.success,
          preview,
        })
        break
      }
      case 'subagent_start':
        print(`  [${counter}] subagent_start: ${event.agentName}`)
        break
      case 'subagent_complete':
        print(`  [${counter}] subagent_complete: ${event.agentName}`)
        break
      case 'finish':
        if (content) print(`  [${counter}] assistant: ${content.slice(0, 500)}`)
        print(
          `  [${counter}] finish: ${event.usage.promptTokens} in / ${event.usage.completionTokens} out`,
        )
        hasFinish = true
        break
      case 'error':
        print(`  [${counter}] error: ${event.error.message}`)
        errors.push(event.error.message)
        break
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

  // ── Validação ─────────────────────────────────────────────
  print(`\n${LINE}`)
  print('  VALIDAÇÃO')
  print(LINE)

  let pass = true

  const checks = [
    {
      label: 'Stream finalizou',
      ok: hasFinish,
    },
    {
      label: 'Sem erros',
      ok: errors.length === 0,
    },
    {
      label: 'Modelo chamou alguma tool',
      ok: toolCalls.length > 0,
    },
    {
      label: 'Modelo chamou a tool greet',
      ok: toolCalls.some((tc) => tc.name === 'greet'),
    },
    {
      label: 'Tool greet executou com sucesso',
      ok: toolResults.some((tr) => tr.name === 'greet' && tr.success),
    },
    {
      label: 'Resultado contém saudação em português',
      ok:
        toolResults.some((tr) => (tr.name === 'greet' && tr.preview?.includes('Olá')) || false) ||
        content.includes('Olá'),
    },
    {
      label: 'Modelo gerou resposta',
      ok: content.length > 0,
    },
  ]

  for (const check of checks) {
    const icon = check.ok ? '✓' : '✗'
    print(`  ${icon} ${check.label}`)
    if (!check.ok) pass = false
  }

  print(`\n  Duração: ${elapsed}s`)
  print(`  Tool calls: ${toolCalls.map((tc) => tc.name).join(', ') || 'nenhuma'}`)
  print(`  ${pass ? 'PASSED ✓' : 'FAILED ✗'}`)
  print(DIVIDER)

  // Cleanup
  await core.plugins.unload('hello-world')
  vllm.stop()
  process.exit(pass ? 0 : 1)
}

main()
