import { generateText as aiGenerateText, streamText, tool } from 'ai'
import { PROVIDERS } from './registry'
import type {
  GenerateConfig,
  GenerateResult,
  ModelInfo,
  ProviderInfo,
  StreamChatConfig,
  StreamEvent,
  TokenUsage,
} from './types'

/**
 * Interface pública do Provider Layer.
 * Abstração unificada para interagir com múltiplos provedores LLM.
 */
export interface ProviderLayer {
  listProviders(): ProviderInfo[]
  listModels(providerId?: string): ModelInfo[]
  streamChat(config: StreamChatConfig): AsyncGenerator<StreamEvent>
  /** Chamada não-streaming ao LLM. Útil para summarização e tarefas internas. */
  generateText(config: GenerateConfig): Promise<GenerateResult>
}

/**
 * Cria uma instância do Provider Layer.
 */
export function createProviderLayer(): ProviderLayer {
  function listProviders(): ProviderInfo[] {
    return Object.values(PROVIDERS).map((entry) => entry.info)
  }

  function listModels(providerId?: string): ModelInfo[] {
    if (providerId) {
      return PROVIDERS[providerId]?.models ?? []
    }
    return Object.values(PROVIDERS).flatMap((entry) => entry.models)
  }

  async function* streamChat(config: StreamChatConfig): AsyncGenerator<StreamEvent> {
    const entry = PROVIDERS[config.provider]
    if (!entry) {
      yield { type: 'error', error: new Error(`Provider '${config.provider}' not found`) }
      return
    }

    const model = entry.createModel(config.model)
    const aiTools = convertTools(config.tools)

    try {
      const result = streamText({
        model,
        messages: config.messages,
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
        abortSignal: config.signal,
        ...(aiTools ? { tools: aiTools } : {}),
      } as Parameters<typeof streamText>[0])

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          yield { type: 'content', content: part.text }
        } else if (part.type === 'tool-call') {
          yield {
            type: 'tool_call',
            id: part.toolCallId,
            name: part.toolName,
            args: part.input,
          }
        }
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

  async function generateText(config: GenerateConfig): Promise<GenerateResult> {
    const entry = PROVIDERS[config.provider]
    if (!entry) {
      throw new Error(`Provider '${config.provider}' not found`)
    }

    const model = entry.createModel(config.model)

    const result = await aiGenerateText({
      model,
      messages: config.messages,
      temperature: config.temperature,
      maxOutputTokens: config.maxTokens,
    } as Parameters<typeof aiGenerateText>[0])

    const usage = result.usage
    return {
      text: result.text,
      usage: {
        promptTokens: usage.inputTokens ?? 0,
        completionTokens: usage.outputTokens ?? 0,
        totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
      },
    }
  }

  return { listProviders, listModels, streamChat, generateText }
}

/** Converte tools do formato Athion para formato AI SDK. */
function convertTools(
  tools?: Record<string, { description: string; parameters: unknown }>,
): Record<string, ReturnType<typeof tool>> | undefined {
  if (!tools || Object.keys(tools).length === 0) return undefined

  const result: Record<string, ReturnType<typeof tool>> = {}
  for (const [name, def] of Object.entries(tools)) {
    result[name] = tool({
      description: def.description,
      inputSchema: def.parameters as Parameters<typeof tool>[0]['inputSchema'],
    })
  }
  return result
}
