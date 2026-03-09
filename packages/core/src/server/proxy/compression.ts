/**
 * Servico de compressao de contexto via LLM.
 * Quando o historico excede o threshold, resume mensagens antigas
 * preservando as mais recentes integralmente.
 */

import {
  buildCompressionInput,
  compressionSystemPrompt,
  compressionUserPrompt,
} from './compression-prompt'
import type { ProxyLogger } from './logger'
import type { Tokenizer } from './tokenizer'
import type { CompressResult, OpenAIChatRequest, OpenAIMessage, ProxyConfig } from './types'
import { backendUrl, effectiveContextLimit } from './types'

/** Quantidade de mensagens recentes a preservar na compressao. */
const PRESERVE_RECENT = 6

/** Interface do servico de compressao. */
export interface CompressionService {
  /** Verifica se compressao e necessaria e aplica se for. */
  compressIfNeeded(body: OpenAIChatRequest): Promise<CompressResult>
}

/** Cria o servico de compressao de contexto.
 * @param config - Configuracao do proxy
 * @param tokenizer - Instancia do tokenizer
 * @param logger - Instancia do logger
 * @returns CompressionService
 */
export function createCompressionService(
  config: ProxyConfig,
  tokenizer: Tokenizer,
  logger: ProxyLogger,
): CompressionService {
  const contextLimit = effectiveContextLimit(config)
  const triggerAt = Math.floor(contextLimit * config.compressionTriggerThreshold)

  return { compressIfNeeded }

  async function compressIfNeeded(body: OpenAIChatRequest): Promise<CompressResult> {
    const originalTokens = tokenizer.countMessages(body.messages)

    if (!config.compressionEnabled || originalTokens < triggerAt) {
      return {
        compressed: false,
        messages: body.messages,
        originalTokens,
        newTokens: originalTokens,
      }
    }

    logger.info('Compression triggered', {
      originalTokens,
      triggerAt,
      contextLimit,
    })

    try {
      const result = await doCompress(body.messages, originalTokens)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('Compression failed, using original messages', { error: msg })
      return {
        compressed: false,
        messages: body.messages,
        originalTokens,
        newTokens: originalTokens,
        error: msg,
      }
    }
  }

  async function doCompress(
    messages: OpenAIMessage[],
    originalTokens: number,
  ): Promise<CompressResult> {
    const { toCompress, preserved } = splitMessages(messages)

    if (toCompress.length === 0) {
      logger.warn('No messages to compress, all preserved')
      return {
        compressed: false,
        messages,
        originalTokens,
        newTokens: originalTokens,
      }
    }

    const inputText = buildCompressionInput(
      toCompress.map((m) => ({
        role: m.role,
        content: m.content,
        toolCalls: m.tool_calls?.map((tc) => tc.function.name),
      })),
    )

    const summary = await callLlmForSummary(inputText)

    const summaryMessage: OpenAIMessage = {
      role: 'system',
      content: `[Conversation Summary]\n${summary}`,
    }

    const newMessages = [summaryMessage, ...preserved]
    const newTokens = tokenizer.countMessages(newMessages)

    logger.info('Compression complete', {
      originalTokens,
      newTokens,
      ratio: ((1 - newTokens / originalTokens) * 100).toFixed(1) + '%',
      compressedMsgs: toCompress.length,
      preservedMsgs: preserved.length,
    })

    return {
      compressed: true,
      messages: newMessages,
      originalTokens,
      newTokens,
    }
  }

  function splitMessages(messages: OpenAIMessage[]): {
    toCompress: OpenAIMessage[]
    preserved: OpenAIMessage[]
  } {
    // Sempre preservar system prompt (primeira mensagem)
    const systemMsgs: OpenAIMessage[] = []
    const rest: OpenAIMessage[] = []

    for (const msg of messages) {
      if (msg.role === 'system' && rest.length === 0) {
        systemMsgs.push(msg)
      } else {
        rest.push(msg)
      }
    }

    const preserveCount = Math.min(PRESERVE_RECENT, rest.length)
    const cutoff = rest.length - preserveCount

    const toCompress = [...systemMsgs, ...rest.slice(0, cutoff)]
    const preserved = rest.slice(cutoff)

    return { toCompress, preserved }
  }

  async function callLlmForSummary(inputText: string): Promise<string> {
    const url = `${backendUrl(config)}/v1/chat/completions`
    const payload: OpenAIChatRequest = {
      model: '',
      messages: [
        { role: 'system', content: compressionSystemPrompt(PRESERVE_RECENT) },
        { role: 'user', content: compressionUserPrompt(inputText) },
      ],
      temperature: 0.3,
      max_tokens: 2048,
      stream: false,
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      throw new Error(`Compression LLM call failed: ${res.status} ${res.statusText}`)
    }

    const data = await res.json()
    const content = data?.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('Compression LLM returned empty response')
    }

    return content.trim()
  }
}
