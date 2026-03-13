/**
 * ModelSwapProvider — wrapper em torno do ProviderLayer que faz swap automático
 * do modelo vLLM antes de cada chamada de streaming.
 *
 * Intercepta `streamChat()` e, se o modelo solicitado difere do atualmente
 * carregado no vLLM, executa unload + load antes de delegar ao provider base.
 *
 * Usado quando orchestratorModel !== agentModel para evitar dois modelos em
 * memória simultaneamente.
 */

import { appendFile } from 'node:fs/promises'
import { createLogger } from '../logger'
import type { ProviderLayer } from './provider'
import type {
  GenerateConfig,
  GenerateResult,
  ModelInfo,
  ProviderInfo,
  StreamChatConfig,
  StreamEvent,
} from './types'
import type { VllmManager } from '../server/vllm-manager'

const log = createLogger('model-swap')

const LOG_PATH = '/tmp/athion-llm.log'
let requestCounter = 0

function ts(): string {
  return `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}]`
}

function filelog(line: string): void {
  appendFile(LOG_PATH, `${line}\n`).catch(() => {})
}

/** Estima tokens a partir da contagem de caracteres (aprox 4 chars/token). */
function estimateTokens(config: StreamChatConfig): number {
  let chars = 0
  for (const msg of config.messages) {
    const c = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    chars += c.length
  }
  if (config.tools) {
    chars += JSON.stringify(config.tools).length
  }
  return Math.round(chars / 4)
}

/** Extrai nomes dos parâmetros de um JSON Schema (para mostrar tool(param1, param2)). */
function toolParams(tool: { parameters?: unknown } | undefined): string {
  if (!tool?.parameters) return ''
  const params = tool.parameters as { properties?: Record<string, unknown> }
  const keys = params.properties ? Object.keys(params.properties) : []
  return keys.length > 0 ? `(${keys.join(', ')})` : ''
}

function logRequest(config: StreamChatConfig, counter: number): void {
  const toolNames = config.tools ? Object.keys(config.tools) : []
  const estTokens = estimateTokens(config)
  const maxTok = config.maxTokens !== null ? String(config.maxTokens) : 'default'
  const lines: string[] = []

  lines.push(`\n${'═'.repeat(60)}`)
  lines.push(`${ts()} → POST /v1/chat/completions #${counter}`)
  lines.push(`model: ${config.model}`)
  lines.push(`stream: true | max_tokens: ${maxTok}`)
  lines.push(`messages: ${config.messages.length} | tools: ${toolNames.length}`)
  lines.push(`est. prompt tokens: ~${estTokens}`)

  if (toolNames.length > 0) {
    lines.push(`\n─── TOOLS ───`)
    for (const name of toolNames) {
      const tool = config.tools?.[name]
      const params = toolParams(tool as { parameters?: unknown } | undefined)
      lines.push(`${name}${params} — ${tool?.description?.slice(0, 80) ?? ''}`)
    }
  }

  lines.push(`\n─── MESSAGES ───`)
  for (let i = 0; i < config.messages.length; i++) {
    const msg = config.messages[i]
    const contentStr = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    const preview = contentStr.slice(0, 500)
    lines.push(`\n[${i}] ${msg.role} (${contentStr.length} chars)`)
    lines.push(preview + (contentStr.length > 500 ? '...' : ''))
  }

  filelog(lines.join('\n'))
}

function logEvent(event: StreamEvent, counter: number): void {
  if (event.type === 'tool_call') {
    filelog(`\n─── TOOL CALL #${counter} ───`)
    filelog(`${event.name}(${JSON.stringify(event.args).slice(0, 300)})`)
  } else if (event.type === 'tool_result') {
    filelog(`\n─── TOOL RESULT #${counter} ───`)
    const result = JSON.stringify(event.result).slice(0, 500)
    filelog(result)
  } else if (event.type === 'finish') {
    filelog(`\n─── FINISH #${counter} ───`)
    filelog(
      `promptTokens: ${event.usage.promptTokens} | completionTokens: ${event.usage.completionTokens} | total: ${event.usage.totalTokens}`,
    )
  }
}

/**
 * Cria um ProviderLayer que intercepta streamChat e faz swap de modelo vLLM
 * automaticamente quando o modelo solicitado difere do atualmente carregado.
 *
 * @param base - Provider base a ser wrapped
 * @param vllm - VllmManager para realizar o swap
 * @param singleModel - quando true, desabilita swap (usa modelo atual para tudo)
 */
export function createModelSwapProvider(
  base: ProviderLayer,
  vllm: VllmManager,
  singleModel = false,
): ProviderLayer {
  async function* streamChat(config: StreamChatConfig): AsyncGenerator<StreamEvent> {
    // Garante que o servidor está no ar antes de qualquer request.
    // Se o servidor caiu após o bootstrap, ensureRunning() sobe novamente.
    await vllm.ensureRunning()

    // Realiza swap quando o modelo solicitado difere do carregado, exceto:
    // - singleModel=true: usuário optou por desabilitar swap (memória insuficiente)
    // - modelos iguais: orquestrador e agente usam o mesmo modelo, swap é no-op
    const current = vllm.currentModel
    const needsSwap = !singleModel && current !== '' && current !== config.model
    if (needsSwap) {
      yield { type: 'model_loading', modelName: config.model }
      try {
        await vllm.swapModel(config.model)
        yield { type: 'model_ready', modelName: config.model }
      } catch (err) {
        // Swap falhou (OOM, timeout, etc) — continua com o modelo atual
        // para não travar o usuário. Loga o problema para diagnóstico.
        const errMsg = err instanceof Error ? err.message : String(err)
        filelog(`\n⚠ SWAP FAILED — falling back to current model (${current})`)
        filelog(`  Requested: ${config.model}`)
        filelog(`  Error: ${errMsg}`)
        filelog(
          `  Dica: configure "mlxOmniSingleModel": true se os modelos não cabem juntos na memória`,
        )
        log.warn(
          { current, requested: config.model, err: errMsg },
          'model swap failed — using current model',
        )
        // Sobrescreve o modelo na config para usar o atual ao invés do solicitado
        config = { ...config, model: current }
        yield { type: 'model_ready', modelName: current }
      }
    }

    const counter = ++requestCounter
    logRequest(config, counter)
    log.info({ model: config.model, counter }, '→ LLM request')

    let assistantContent = ''
    for await (const event of base.streamChat(config)) {
      if (event.type === 'content') {
        assistantContent += event.content
      } else if (event.type === 'finish') {
        if (assistantContent) {
          filelog(`\n─── ASSISTANT #${counter} ───`)
          filelog(assistantContent.slice(0, 1000) + (assistantContent.length > 1000 ? '...' : ''))
        }
        logEvent(event, counter)
        log.info(
          {
            model: config.model,
            counter,
            promptTokens: event.usage.promptTokens,
            completionTokens: event.usage.completionTokens,
          },
          '← LLM finish',
        )
      } else {
        logEvent(event, counter)
      }
      yield event
    }
  }

  return {
    listProviders(): ProviderInfo[] {
      return base.listProviders()
    },
    listModels(providerId?: string): ModelInfo[] {
      return base.listModels(providerId)
    },
    streamChat,
    generateText(config: GenerateConfig): Promise<GenerateResult> {
      return base.generateText(config)
    },
  }
}
