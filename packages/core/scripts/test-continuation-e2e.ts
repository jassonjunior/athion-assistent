/**
 * E2E Test: Agent Continuation Protocol com LLM
 *
 * Força o subagente a esgotar seu contexto e validar que:
 * 1. O agente sai com status='partial' quando o contexto enche
 * 2. O task-tool re-spawna automaticamente com resultados acumulados
 * 3. O resultado final consolida todas as continuações
 * 4. O orchestrator recebe resultado único (transparente)
 *
 * Estratégia: cria 20 arquivos temporários (~8KB cada = ~160KB total)
 * e pede ao agente para ler e analisar todos.
 * Com CONTEXT_LIMIT=50K tokens (~200K chars) e threshold de 80%,
 * isso deve forçar pelo menos 1 continuação.
 */

import { resolve } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { bootstrap } from '../src/bootstrap'
import { createVllmManager } from '../src/server/vllm-manager'

const DIVIDER = '═'.repeat(60)
const LINE = '─'.repeat(60)

function print(msg: string) {
  console.log(msg)
}

/** Gera conteúdo de arquivo TypeScript sintético com várias funções exportadas. */
function generateTsFile(moduleIndex: number): string {
  const functions: string[] = []
  for (let i = 0; i < 8; i++) {
    const fnName = `process${String.fromCharCode(65 + i)}Data_Module${moduleIndex}`
    functions.push(`
/**
 * Processes data for module ${moduleIndex}, variant ${String.fromCharCode(65 + i)}.
 * This function handles the ${['validation', 'transformation', 'normalization', 'aggregation', 'filtering', 'sorting', 'mapping', 'reduction'][i]} step.
 * It receives an array of records, applies the configured rules, and returns the processed output.
 * Supports both synchronous and asynchronous processing modes depending on the input size.
 * When the input exceeds 1000 records, it automatically switches to batch processing.
 *
 * @param data - The input data array to process
 * @param options - Configuration options for processing
 * @returns The processed data with metadata
 */
export async function ${fnName}(
  data: Array<{ id: string; value: number; metadata: Record<string, unknown> }>,
  options: { batchSize?: number; timeout?: number; retries?: number } = {}
): Promise<{ results: Array<{ id: string; processed: boolean; output: unknown }>; stats: { total: number; success: number; failed: number } }> {
  const batchSize = options.batchSize ?? 100
  const timeout = options.timeout ?? 5000
  const results: Array<{ id: string; processed: boolean; output: unknown }> = []
  let success = 0
  let failed = 0

  for (let batch = 0; batch < data.length; batch += batchSize) {
    const chunk = data.slice(batch, batch + batchSize)
    for (const item of chunk) {
      try {
        const output = await transform_${moduleIndex}_${i}(item, timeout)
        results.push({ id: item.id, processed: true, output })
        success++
      } catch {
        results.push({ id: item.id, processed: false, output: null })
        failed++
      }
    }
  }

  return { results, stats: { total: data.length, success, failed } }
}

async function transform_${moduleIndex}_${i}(
  item: { id: string; value: number; metadata: Record<string, unknown> },
  _timeout: number
): Promise<unknown> {
  return { ...item, transformedAt: new Date().toISOString(), module: ${moduleIndex}, variant: '${String.fromCharCode(65 + i)}' }
}`)
  }

  return `// Module ${moduleIndex}: Auto-generated data processing module
// This module contains functions for processing various data types
// Each function handles a specific transformation step in the pipeline

${functions.join('\n')}

export const MODULE_${moduleIndex}_VERSION = '1.0.0'
export const MODULE_${moduleIndex}_DESCRIPTION = 'Data processing module ${moduleIndex}'
`
}

async function main() {
  print(DIVIDER)
  print('  CONTINUATION E2E — Agent Continuation Protocol com LLM')
  print(DIVIDER)

  // ── 1. Criar arquivos temporários ──────────────────────────
  const tmpDir = '/tmp/athion-continuation-test'
  const FILE_COUNT = 20

  print(`\n[1/5] Criando ${FILE_COUNT} arquivos TypeScript temporários...`)
  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })

  let totalBytes = 0
  for (let i = 0; i < FILE_COUNT; i++) {
    const content = generateTsFile(i)
    const filePath = resolve(tmpDir, `module-${i}.ts`)
    writeFileSync(filePath, content)
    totalBytes += content.length
  }
  print(
    `  ✓ ${FILE_COUNT} arquivos criados em ${tmpDir} (${(totalBytes / 1024).toFixed(0)}KB total)`,
  )

  // ── 2. Start vllm-mlx ────────────────────────────────────
  print('[2/5] Iniciando vllm-mlx...')
  const vllm = createVllmManager()
  await vllm.ensureRunning()
  print(`  ✓ vllm-mlx online em ${vllm.baseUrl}`)

  // ── 3. Bootstrap core ─────────────────────────────────────
  print('[3/5] Bootstrap do core...')
  const core = await bootstrap({
    dbPath: '/tmp/athion-e2e-continuation.db',
    skillsDir: resolve(import.meta.dir, '../skills'),
  })

  // Reduzir maxTurns do search agent para forçar continuation
  // Em produção é 30, mas para teste usamos 3 para garantir que esgota turnos
  const searchConfig = core.subagents.getAgent('search')
  if (searchConfig) {
    searchConfig.maxTurns = 3
    print(
      `  ✓ Core inicializado (search.maxTurns = ${searchConfig.maxTurns} para forçar continuation)`,
    )
  } else {
    print(`  ✓ Core inicializado`)
  }

  // ── 4. Chat com task complexa ─────────────────────────────
  print(`\n[4/5] Enviando task complexa ao modelo...`)
  print(LINE)

  const session = await core.orchestrator.createSession('e2e-continuation', 'Continuation Test')
  print(`  Session: ${session.id}`)

  const userMessage = `Use the task tool to delegate this to the "search" agent with the following description: "Read every TypeScript file in ${tmpDir} one by one using the read_file tool. There are ${FILE_COUNT} files. For EACH file, call read_file to read its complete content, then extract ALL exported function names. Do NOT skip any file. Do NOT use search_files — you must use read_file on each file individually. After reading all ${FILE_COUNT} files, provide the complete list of all exported functions with the total count."`
  print(`  User: ${userMessage.slice(0, 100)}...`)
  print(LINE)

  const stream = core.orchestrator.chat(session.id, { content: userMessage })

  // Coletar eventos com foco em continuações
  const toolCalls: Array<{ name: string; args: unknown }> = []
  const toolResults: Array<{ name: string; success: boolean; data?: unknown }> = []
  let content = ''
  let hasFinish = false
  const errors: string[] = []
  let subagentStarts = 0
  let subagentCompletes = 0
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
          `  [${counter}] tool_call: ${event.name}(${JSON.stringify(event.args).slice(0, 150)})`,
        )
        toolCalls.push({ name: event.name, args: event.args })
        break
      case 'tool_result': {
        const ok = event.result.success ? 'OK' : `ERROR: ${event.result.error}`
        const preview = event.result.success
          ? String(JSON.stringify(event.result.data)).slice(0, 200)
          : ''
        print(
          `  [${counter}] tool_result: ${event.name} → ${ok} ${preview ? preview.slice(0, 100) + '...' : ''}`,
        )
        toolResults.push({
          name: event.name,
          success: event.result.success,
          data: event.result.data,
        })
        break
      }
      case 'subagent_start':
        subagentStarts++
        print(`  [${counter}] subagent_start: ${event.agentName}`)
        break
      case 'subagent_complete':
        subagentCompletes++
        print(`  [${counter}] subagent_complete: ${event.agentName}`)
        break
      case 'finish':
        if (content) print(`  [${counter}] assistant: ${content.slice(0, 300)}...`)
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

  // ── 5. Validação ──────────────────────────────────────────
  print(`\n[5/5] Validação`)
  print(LINE)

  // Extrair info de continuação do resultado da task
  const taskResultData = toolResults.find((tr) => tr.name === 'task' && tr.success)
  const continuations = (taskResultData?.data as { continuations?: number })?.continuations ?? 0
  const resultHasContent = content.length > 0

  print(`\n  ℹ Continuações detectadas: ${continuations}`)

  const checks = [
    {
      label: 'Stream finalizou',
      ok: hasFinish,
    },
    {
      label: 'Modelo delegou via task tool',
      ok: toolCalls.some((tc) => tc.name === 'task'),
    },
    {
      label: 'Task executou com sucesso',
      ok: toolResults.some((tr) => tr.name === 'task' && tr.success),
    },
    {
      label: 'Modelo gerou resposta final',
      ok: resultHasContent,
    },
    {
      label: 'Subagent foi iniciado',
      ok: subagentStarts > 0,
    },
    {
      label: 'Subagent completou',
      ok: subagentCompletes > 0,
    },
    {
      label: 'Resultado da task ou resposta menciona conteúdo dos arquivos',
      ok:
        content.toLowerCase().includes('function') ||
        content.toLowerCase().includes('export') ||
        content.includes('process') ||
        content.includes('module') ||
        JSON.stringify(taskResultData?.data ?? '').includes('module'),
    },
    {
      label: `Continuation protocol ativou (continuations=${continuations})`,
      ok: continuations > 0,
    },
  ]

  let pass = true
  for (const check of checks) {
    const icon = check.ok ? '✓' : '✗'
    print(`  ${icon} ${check.label}`)
    if (!check.ok) pass = false
  }

  print(`\n  Duração: ${elapsed}s`)
  print(`  Tool calls: ${toolCalls.map((tc) => tc.name).join(', ')}`)
  print(`  Subagent starts: ${subagentStarts}`)
  print(`  Subagent completes: ${subagentCompletes}`)
  print(`  Resposta: ${content.length} chars`)
  print(`  ${pass ? 'PASSED ✓' : 'FAILED ✗'}`)
  print(DIVIDER)

  // Cleanup
  rmSync(tmpDir, { recursive: true, force: true })
  vllm.stop()
  process.exit(pass ? 0 : 1)
}

main()
