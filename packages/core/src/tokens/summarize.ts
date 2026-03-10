/**
 * SummarizationService — gera resumos de contexto via LLM.
 * Chamado pelo TokenManager quando a estrategia e 'summarize'.
 * Reutiliza os prompts estruturados de compression-prompt.ts.
 */

import type { ProviderLayer } from '../provider/provider'
import {
  buildCompressionInput,
  compressionSystemPrompt,
  compressionUserPrompt,
} from '../server/proxy/compression-prompt'

/** Quantidade de mensagens recentes a preservar (nao resumir). */
const PRESERVE_RECENT = 6

/** Prefixo que marca uma mensagem como permanente — nunca sera compactada. */
export const PINNED_PREFIX = '[PINNED]\n'

/** Marca uma mensagem como pinned (nao compactavel). */
export function pinMessage(content: string): string {
  return `${PINNED_PREFIX}${content}`
}

/** Retorna true se a mensagem e pinned. */
export function isPinnedMessage(msg: { content: string }): boolean {
  return msg.content.startsWith(PINNED_PREFIX)
}

type Message = { role: string; content: string }

export interface SummarizationService {
  /**
   * Resume mensagens antigas em um resumo estruturado via LLM.
   * Preserva as ultimas PRESERVE_RECENT mensagens integralmente.
   * @returns Array compactado: [system msgs, resumo, mensagens recentes]
   */
  summarize(messages: Message[]): Promise<Message[]>
}

interface SummarizationDeps {
  provider: ProviderLayer
  /** ID do provider LLM (ex: 'vllm-mlx') */
  providerId: string
  /** ID do modelo (ex: 'qwen3-coder-reap-40b-a3b') */
  modelId: string
}

export function createSummarizationService(deps: SummarizationDeps): SummarizationService {
  return { summarize }

  async function summarize(messages: Message[]): Promise<Message[]> {
    const { systemMsgs, pinnedMsgs, toCompress, preserved } = splitMessages(messages)

    if (toCompress.length === 0) {
      return messages
    }

    const inputText = buildCompressionInput(
      toCompress.map((m) => ({ role: m.role, content: m.content })),
    )

    const summary = await callLlm(inputText)

    const summaryMessage: Message = {
      role: 'system',
      content: `[Conversation Summary]\n${summary}`,
    }

    // Ordem: system msgs → pinned (contexto permanente) → resumo → mensagens recentes
    return [...systemMsgs, ...pinnedMsgs, summaryMessage, ...preserved]
  }

  function splitMessages(messages: Message[]): {
    systemMsgs: Message[]
    pinnedMsgs: Message[]
    toCompress: Message[]
    preserved: Message[]
  } {
    const systemMsgs: Message[] = []
    const pinnedMsgs: Message[] = []
    const rest: Message[] = []

    for (const msg of messages) {
      if (msg.role === 'system' && rest.length === 0 && pinnedMsgs.length === 0) {
        systemMsgs.push(msg)
      } else if (isPinnedMessage(msg)) {
        pinnedMsgs.push(msg)
      } else {
        rest.push(msg)
      }
    }

    const preserveCount = Math.min(PRESERVE_RECENT, rest.length)
    const cutoff = rest.length - preserveCount

    return {
      systemMsgs,
      pinnedMsgs,
      toCompress: rest.slice(0, cutoff),
      preserved: rest.slice(cutoff),
    }
  }

  async function callLlm(inputText: string): Promise<string> {
    const result = await deps.provider.generateText({
      provider: deps.providerId,
      model: deps.modelId,
      messages: [
        { role: 'system', content: compressionSystemPrompt(PRESERVE_RECENT) },
        { role: 'user', content: compressionUserPrompt(inputText) },
      ],
      temperature: 0.3,
      maxTokens: 2048,
    })

    if (!result.text.trim()) {
      throw new Error('Summarization LLM returned empty response')
    }

    return result.text.trim()
  }
}
