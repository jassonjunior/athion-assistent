/**
 * E2E Test: Tool Level System com LLM
 *
 * Valida que o sistema de níveis de tools funciona corretamente:
 * - Tools com level='orchestrator' (plugin greet) → modelo chama direto ✓
 * - Tools com level='agent' (read_file) → bloqueadas no orchestrator ✗
 *
 * Fluxo:
 * 1. Bootstrap + carrega plugin hello-world (tool greet = orchestrator)
 * 2. Cenário A: pede ao modelo usar greet → deve funcionar
 * 3. Cenário B: pede ao modelo ler um arquivo → deve delegar via task (ou ser bloqueado)
 */

import { resolve } from 'node:path'
import { bootstrap } from '../src/bootstrap'
import { createVllmManager } from '../src/server/vllm-manager'
import type { OrchestratorEvent } from '../src/orchestrator/types'
import helloWorldPlugin from '../src/plugins/examples/hello-world/index'
import { isOrchestratorTool, getToolLevel } from '../src/tools/types'

const DIVIDER = '═'.repeat(60)
const LINE = '─'.repeat(60)

function print(msg: string) {
  console.log(msg)
}

/** Coleta eventos de um chat stream e retorna dados agregados. */
async function collectStream(stream: AsyncGenerator<OrchestratorEvent>) {
  const toolCalls: Array<{ name: string; args: unknown }> = []
  const toolResults: Array<{ name: string; success: boolean; error?: string; preview?: string }> =
    []
  let content = ''
  let hasFinish = false
  const errors: string[] = []
  let counter = 0

  for await (const event of stream) {
    counter++
    switch (event.type) {
      case 'content':
        content += event.content
        break
      case 'tool_call':
        print(
          `    [${counter}] tool_call: ${event.name}(${JSON.stringify(event.args).slice(0, 200)})`,
        )
        toolCalls.push({ name: event.name, args: event.args })
        break
      case 'tool_result': {
        const ok = event.result.success ? 'OK' : `BLOCKED: ${event.result.error}`
        const preview = event.result.success
          ? JSON.stringify(event.result.data).slice(0, 200)
          : (event.result.error ?? '')
        print(`    [${counter}] tool_result: ${event.name} → ${ok}`)
        toolResults.push({
          name: event.name,
          success: event.result.success,
          error: event.result.error,
          preview,
        })
        break
      }
      case 'subagent_start':
        print(`    [${counter}] subagent_start: ${event.agentName}`)
        break
      case 'subagent_complete':
        print(`    [${counter}] subagent_complete: ${event.agentName}`)
        break
      case 'finish':
        if (content) print(`    [${counter}] assistant: ${content.slice(0, 300)}`)
        print(
          `    [${counter}] finish: ${event.usage.promptTokens} in / ${event.usage.completionTokens} out`,
        )
        hasFinish = true
        break
      case 'error':
        print(`    [${counter}] error: ${event.error.message}`)
        errors.push(event.error.message)
        break
    }
  }

  return { toolCalls, toolResults, content, hasFinish, errors }
}

async function main() {
  print(DIVIDER)
  print('  TOOL LEVEL E2E — Validação do sistema de níveis com LLM')
  print(DIVIDER)

  // ── 1. Start vllm-mlx ────────────────────────────────────
  print('\n[1/5] Iniciando vllm-mlx...')
  const vllm = createVllmManager()
  await vllm.ensureRunning()
  print(`  ✓ vllm-mlx online em ${vllm.baseUrl}`)

  // ── 2. Bootstrap core ─────────────────────────────────────
  print('[2/5] Bootstrap do core...')
  const core = await bootstrap({
    dbPath: '/tmp/athion-e2e-tool-level.db',
    skillsDir: resolve(import.meta.dir, '../skills'),
  })

  // ── 3. Load plugin + verificar níveis ─────────────────────
  print('[3/5] Carregando plugin hello-world + verificando níveis...')
  await core.plugins.load(helloWorldPlugin)

  // Verificar a classificação de cada tool
  const allTools = core.tools.list()
  print(`  Total de tools: ${allTools.length}`)
  for (const t of allTools) {
    const level = getToolLevel(t)
    const icon = level === 'orchestrator' ? '🟢' : '🔵'
    print(`    ${icon} ${t.name} → level=${level}`)
  }

  const orchestratorTools = allTools.filter((t) => isOrchestratorTool(t))
  const agentTools = allTools.filter((t) => !isOrchestratorTool(t))
  print(`  Orchestrator-level: ${orchestratorTools.map((t) => t.name).join(', ')}`)
  print(`  Agent-level: ${agentTools.map((t) => t.name).join(', ')}`)

  // ── 4. Cenário A: tool orchestrator-level (greet) ─────────
  print(`\n[4/5] CENÁRIO A — Tool orchestrator-level (greet)`)
  print(LINE)

  const sessionA = await core.orchestrator.createSession('e2e-tool-level', 'Cenário A: greet')
  const msgA = 'Use the greet tool to greet "Carlos" in Portuguese.'
  print(`  User: ${msgA}`)

  const resultA = await collectStream(core.orchestrator.chat(sessionA.id, { content: msgA }))

  print(`\n  Validação Cenário A:`)
  const checksA = [
    { label: 'Stream finalizou', ok: resultA.hasFinish },
    { label: 'Sem erros', ok: resultA.errors.length === 0 },
    { label: 'Modelo chamou greet', ok: resultA.toolCalls.some((tc) => tc.name === 'greet') },
    {
      label: 'Greet executou com sucesso',
      ok: resultA.toolResults.some((tr) => tr.name === 'greet' && tr.success),
    },
    {
      label: 'Resultado contém saudação',
      ok:
        resultA.toolResults.some((tr) => tr.name === 'greet' && tr.preview?.includes('Olá')) ||
        resultA.content.includes('Olá'),
    },
    {
      label: 'Modelo NÃO chamou read_file diretamente',
      ok: !resultA.toolCalls.some((tc) => tc.name === 'read_file'),
    },
  ]

  let passA = true
  for (const check of checksA) {
    const icon = check.ok ? '✓' : '✗'
    print(`    ${icon} ${check.label}`)
    if (!check.ok) passA = false
  }

  // ── 5. Cenário B: tentar chamar tool agent-level ──────────
  print(`\n[5/5] CENÁRIO B — Tool agent-level (read_file)`)
  print(LINE)
  print('  Neste cenário, o modelo recebe as tools filtradas (só orchestrator-level).')
  print('  Ele NÃO deve conseguir chamar read_file diretamente.')
  print('  Se tentar, handleToolCalls bloqueia e retorna erro.')

  const sessionB = await core.orchestrator.createSession('e2e-tool-level', 'Cenário B: read_file')
  const msgB =
    'Read the file at /tmp/athion-e2e-tool-level.db and tell me its first line. Use the read_file tool directly.'
  print(`  User: ${msgB}`)

  const resultB = await collectStream(core.orchestrator.chat(sessionB.id, { content: msgB }))

  print(`\n  Validação Cenário B:`)

  // O modelo pode:
  // (a) NÃO chamar read_file (correto - não está no prompt) → PASS
  // (b) Chamar read_file mas ser bloqueado pelo handleToolCalls → PASS
  // (c) Delegar via task tool → PASS (comportamento ideal)
  const calledReadFile = resultB.toolCalls.some((tc) => tc.name === 'read_file')
  const readFileBlocked = resultB.toolResults.some(
    (tr) =>
      tr.name === 'read_file' &&
      !tr.success &&
      (tr.error?.includes('not available directly') || false),
  )
  const delegatedViaTask = resultB.toolCalls.some((tc) => tc.name === 'task')

  const checksB = [
    { label: 'Stream finalizou', ok: resultB.hasFinish },
    {
      label: 'read_file NÃO chamado OU bloqueado OU delegado via task',
      ok: !calledReadFile || readFileBlocked || delegatedViaTask,
    },
    {
      label: 'Se read_file chamado → foi bloqueado com mensagem correta',
      ok: !calledReadFile || readFileBlocked,
    },
    { label: 'Modelo gerou resposta', ok: resultB.content.length > 0 },
  ]

  let passB = true
  for (const check of checksB) {
    const icon = check.ok ? '✓' : '✗'
    print(`    ${icon} ${check.label}`)
    if (!check.ok) passB = false
  }

  // Detalhe do comportamento observado
  if (!calledReadFile && !delegatedViaTask) {
    print('    ℹ Modelo não tentou chamar read_file (tool não visível no prompt)')
  } else if (readFileBlocked) {
    print('    ℹ Modelo tentou read_file, handleToolCalls bloqueou corretamente')
  } else if (delegatedViaTask) {
    print('    ℹ Modelo delegou via task tool (comportamento ideal)')
  }

  // ── Resultado final ───────────────────────────────────────
  print(`\n${LINE}`)
  const allPass = passA && passB
  print(`  CENÁRIO A (orchestrator tools): ${passA ? 'PASSED ✓' : 'FAILED ✗'}`)
  print(`  CENÁRIO B (agent tools blocked): ${passB ? 'PASSED ✓' : 'FAILED ✗'}`)
  print(`  RESULTADO FINAL: ${allPass ? 'PASSED ✓' : 'FAILED ✗'}`)
  print(DIVIDER)

  // Cleanup
  await core.plugins.unload('hello-world')
  vllm.stop()
  process.exit(allPass ? 0 : 1)
}

main()
