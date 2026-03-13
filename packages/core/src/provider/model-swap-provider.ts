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
/** Limite do log em bytes (~2MB). Ao exceder, trunca para metade. */
const LOG_MAX_BYTES = 2 * 1024 * 1024
let requestCounter = 0

function ts(): string {
  return `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}]`
}

function filelog(line: string): void {
  appendFile(LOG_PATH, `${line}\n`).catch(() => {})
}

/** Rotaciona o log se exceder LOG_MAX_BYTES. */
async function rotateLogIfNeeded(): Promise<void> {
  try {
    const { stat, writeFile } = await import('node:fs/promises')
    const s = await stat(LOG_PATH).catch(() => null)
    if (s && s.size > LOG_MAX_BYTES) {
      await writeFile(LOG_PATH, `${ts()} === log rotated (was ${s.size} bytes) ===\n`)
    }
  } catch {
    /* ignore */
  }
}

/** Log compacto: só metadata, sem serializar mensagens inteiras. */
function logRequest(config: StreamChatConfig, counter: number): void {
  const toolNames = config.tools ? Object.keys(config.tools) : []
  const maxTok = config.maxTokens !== null ? String(config.maxTokens) : 'default'

  // Conta chars sem criar strings intermediárias grandes
  let msgChars = 0
  for (const msg of config.messages) {
    msgChars += typeof msg.content === 'string' ? msg.content.length : 200
  }

  const line = [
    `${ts()} → #${counter} ${config.model}`,
    `msgs=${config.messages.length} tools=${toolNames.length} max_tokens=${maxTok} est_prompt=~${Math.round(msgChars / 4)}`,
    toolNames.length > 0 ? `tools: ${toolNames.join(',')}` : '',
  ]
    .filter(Boolean)
    .join(' | ')

  filelog(line)
}

function logFinish(
  counter: number,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number },
): void {
  filelog(
    `${ts()} ← #${counter} prompt=${usage.promptTokens} completion=${usage.completionTokens} total=${usage.totalTokens}`,
  )
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
    await rotateLogIfNeeded()
    logRequest(config, counter)
    log.info({ model: config.model, counter }, '→ LLM request')

    let contentLen = 0
    for await (const event of base.streamChat(config)) {
      if (event.type === 'content') {
        contentLen += event.content.length
      } else if (event.type === 'finish') {
        logFinish(counter, event.usage)
        log.info(
          {
            model: config.model,
            counter,
            promptTokens: event.usage.promptTokens,
            completionTokens: event.usage.completionTokens,
            contentChars: contentLen,
          },
          '← LLM finish',
        )
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
