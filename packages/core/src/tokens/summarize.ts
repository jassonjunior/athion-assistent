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
    const { systemMsgs, toCompress, preserved } = splitMessages(messages)

    // Nada para comprimir — retorna as mensagens como estao
    if (toCompress.length === 0) {
      return messages
    }

    // Monta o texto das mensagens a comprimir
    const inputText = buildCompressionInput(
      toCompress.map((m) => ({ role: m.role, content: m.content })),
    )

    // Chama o LLM para gerar o resumo
    const summary = await callLlm(inputText)

    // Monta resultado: system msgs + resumo + mensagens recentes preservadas
    const summaryMessage: Message = {
      role: 'system',
      content: `[Conversation Summary]\n${summary}`,
    }

    return [...systemMsgs, summaryMessage, ...preserved]
  }

  function splitMessages(messages: Message[]): {
    systemMsgs: Message[]
    toCompress: Message[]
    preserved: Message[]
  } {
    // Separar system messages (inicio) das demais
    const systemMsgs: Message[] = []
    const rest: Message[] = []

    for (const msg of messages) {
      if (msg.role === 'system' && rest.length === 0) {
        systemMsgs.push(msg)
      } else {
        rest.push(msg)
      }
    }

    const preserveCount = Math.min(PRESERVE_RECENT, rest.length)
    const cutoff = rest.length - preserveCount

    return {
      systemMsgs,
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
