/** ModelSwapProvider
 * Descrição: Wrapper em torno do ProviderLayer que faz swap automático
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

/** LOG_PATH
 * Descrição: Caminho do arquivo de log para requisições LLM
 */
const LOG_PATH = '/tmp/athion-llm.log'

/** LOG_MAX_BYTES
 * Descrição: Limite do log em bytes (~2MB). Ao exceder, trunca para metade.
 */
const LOG_MAX_BYTES = 2 * 1024 * 1024

/** requestCounter
 * Descrição: Contador incremental de requisições para rastreamento no log
 */
let requestCounter = 0

/** ts
 * Descrição: Gera timestamp formatado para uso nos logs
 * @returns String com timestamp no formato [YYYY-MM-DD HH:MM:SS]
 */
function ts(): string {
  return `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}]`
}

/** filelog
 * Descrição: Escreve uma linha no arquivo de log de forma assíncrona
 * @param line - Linha a ser escrita no log
 */
function filelog(line: string): void {
  appendFile(LOG_PATH, `${line}\n`).catch(() => {})
}

/** rotateLogIfNeeded
 * Descrição: Rotaciona o arquivo de log se exceder LOG_MAX_BYTES, evitando crescimento infinito
 * @returns Promise que resolve quando a verificação/rotação termina
 */
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

/** logRequest
 * Descrição: Registra metadados compactos de uma requisição ao LLM no log (sem serializar mensagens inteiras)
 * @param config - Configuração da chamada de streaming
 * @param counter - Número sequencial da requisição
 */
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

/** logFinish
 * Descrição: Registra no log os dados de uso de tokens ao finalizar uma requisição
 * @param counter - Número sequencial da requisição
 * @param usage - Contagem de tokens consumidos (prompt, completion, total)
 */
function logFinish(
  counter: number,
  usage: { promptTokens: number; completionTokens: number; totalTokens: number },
): void {
  filelog(
    `${ts()} ← #${counter} prompt=${usage.promptTokens} completion=${usage.completionTokens} total=${usage.totalTokens}`,
  )
}

/** createModelSwapProvider
 * Descrição: Cria um ProviderLayer que intercepta streamChat e faz swap de modelo vLLM
 * automaticamente quando o modelo solicitado difere do atualmente carregado.
 * @param base - Provider base a ser encapsulado
 * @param vllm - VllmManager para realizar o swap de modelo
 * @param singleModel - Quando true, desabilita swap (usa modelo atual para tudo)
 * @returns Instância do ProviderLayer com swap automático
 */
export function createModelSwapProvider(
  base: ProviderLayer,
  vllm: VllmManager,
  singleModel = false,
): ProviderLayer {
  /** streamChat
   * Descrição: Streaming de chat com swap automático de modelo quando necessário
   * @param config - Configuração da chamada de streaming
   * @returns AsyncGenerator que emite StreamEvent incluindo eventos de swap
   */
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
    /** listProviders
     * Descrição: Delega listagem de providers ao provider base
     * @returns Lista de informações dos providers disponíveis
     */
    listProviders(): ProviderInfo[] {
      return base.listProviders()
    },
    /** listModels
     * Descrição: Delega listagem de modelos ao provider base
     * @param providerId - ID do provider para filtrar (opcional)
     * @returns Lista de informações dos modelos disponíveis
     */
    listModels(providerId?: string): ModelInfo[] {
      return base.listModels(providerId)
    },
    streamChat,
    /** generateText
     * Descrição: Delega chamada não-streaming ao provider base
     * @param config - Configuração da chamada
     * @returns Resultado com texto gerado e uso de tokens
     */
    generateText(config: GenerateConfig): Promise<GenerateResult> {
      return base.generateText(config)
    },
  }
}
