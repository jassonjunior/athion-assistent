import { streamText } from 'ai'
import { PROVIDERS } from './registry'
import type { ModelInfo, ProviderInfo, StreamChatConfig, StreamEvent, TokenUsage } from './types'

/**
 * Interface pública do Provider Layer.
 * Abstração unificada para interagir com múltiplos provedores LLM.
 * Todos os providers são acessados através da mesma API.
 */
export interface ProviderLayer {
  /**
   * Lista todos os providers registrados.
   * @returns Array com informações de cada provider (id, nome, isLocal)
   */
  listProviders(): ProviderInfo[]

  /**
   * Lista todos os modelos disponíveis, opcionalmente filtrando por provider.
   * @param providerId - Se informado, retorna apenas modelos deste provider
   * @returns Array com informações de cada modelo
   */
  listModels(providerId?: string): ModelInfo[]

  /**
   * Inicia um streaming de chat com o LLM.
   * Retorna um AsyncGenerator que emite StreamEvents conforme o LLM gera a resposta.
   * Suporta cancelamento via AbortSignal.
   * @param config - Configuração da chamada (provider, model, messages, etc.)
   * @returns AsyncGenerator que emite StreamEvent (content, tool_call, finish, error)
   * @example
   * const stream = providerLayer.streamChat({
   *   provider: 'vllm-mlx',
   *   model: 'qwen3-coder-reap-40b-a3b',
   *   messages: [{ role: 'user', content: 'Olá!' }],
   * })
   * for await (const event of stream) {
   *   if (event.type === 'content') process.stdout.write(event.content)
   * }
   */
  streamChat(config: StreamChatConfig): AsyncGenerator<StreamEvent>
}

/**
 * Cria uma instância do Provider Layer.
 * Usa o registro de providers para resolver modelos e executar streaming.
 * @returns Instância do ProviderLayer pronta para uso
 * @throws {Error} Se o provider solicitado não existir no registro
 */
export function createProviderLayer(): ProviderLayer {
  function listProviders(): ProviderInfo[] {
    return Object.values(PROVIDERS).map((entry) => entry.info)
  }

  /**
   * Lista todos os modelos disponíveis, opcionalmente filtrando por provider.
   * @param providerId - Se informado, retorna apenas modelos deste provider
   * @returns Array com informações de cada modelo
   */
  function listModels(providerId?: string): ModelInfo[] {
    if (providerId) {
      return PROVIDERS[providerId]?.models ?? []
    }
    return Object.values(PROVIDERS).flatMap((entry) => entry.models)
  }

  /**
   * Inicia um streaming de chat com o LLM.
   * Retorna um AsyncGenerator que emite StreamEvents conforme o LLM gera a resposta.
   * Suporta cancelamento via AbortSignal.
   * @param config - Configuração da chamada (provider, model, messages, etc.)
   * @returns AsyncGenerator que emite StreamEvent (content, tool_call, finish, error)
   */
  async function* streamChat(config: StreamChatConfig): AsyncGenerator<StreamEvent> {
    const entry = PROVIDERS[config.provider]
    if (!entry) {
      yield { type: 'error', error: new Error(`Provider '${config.provider}' not found`) }
      return
    }

    const model = entry.createModel(config.model)

    try {
      const result = streamText({
        model,
        messages: config.messages,
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
        abortSignal: config.signal,
      } as Parameters<typeof streamText>[0])

      for await (const part of result.textStream) {
        yield { type: 'content', content: part }
      }

      const usage = await result.usage
      const tokenUsage: TokenUsage = {
        promptTokens: usage.inputTokens ?? 0,
        completionTokens: usage.outputTokens ?? 0,
        totalTokens: 0,
      }
      tokenUsage.totalTokens = tokenUsage.promptTokens + tokenUsage.completionTokens

      yield { type: 'finish', usage: tokenUsage }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      yield { type: 'error', error: error instanceof Error ? error : new Error(String(error)) }
    }
  }

  return { listProviders, listModels, streamChat }
}
