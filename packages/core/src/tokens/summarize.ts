/** @module summarize
 * Descrição: Serviço de sumarização de contexto via LLM.
 * Chamado pelo TokenManager quando a estratégia de compactação é 'summarize'.
 * Reutiliza os prompts estruturados de compression-prompt.ts.
 */

import type { ProviderLayer } from '../provider/provider'
import {
  buildCompressionInput,
  compressionSystemPrompt,
  compressionUserPrompt,
} from '../server/proxy/compression-prompt'

/** PRESERVE_RECENT
 * Descrição: Quantidade de mensagens recentes a preservar integralmente (não resumir).
 */
const PRESERVE_RECENT = 6

/** PINNED_PREFIX
 * Descrição: Prefixo que marca uma mensagem como permanente — nunca será compactada.
 * Mensagens com este prefixo são sempre preservadas durante a compactação.
 */
export const PINNED_PREFIX = '[PINNED]\n'

/** pinMessage
 * Descrição: Marca uma mensagem como pinned (não compactável) adicionando o prefixo PINNED.
 * @param content - Conteúdo da mensagem a ser marcada
 * @returns Conteúdo com o prefixo PINNED adicionado
 */
export function pinMessage(content: string): string {
  return `${PINNED_PREFIX}${content}`
}

/** isPinnedMessage
 * Descrição: Verifica se uma mensagem é pinned (não compactável).
 * @param msg - Objeto de mensagem com propriedade content
 * @returns true se a mensagem possui o prefixo PINNED
 */
export function isPinnedMessage(msg: { content: string }): boolean {
  return msg.content.startsWith(PINNED_PREFIX)
}

/** Message
 * Descrição: Tipo auxiliar para representar uma mensagem com role e content.
 */
type Message = { role: string; content: string }

/** SummarizationService
 * Descrição: Interface do serviço de sumarização de contexto.
 * Gera resumos estruturados via chamadas ao LLM.
 */
export interface SummarizationService {
  /** summarize
   * Descrição: Resume mensagens antigas em um resumo estruturado via LLM.
   * Preserva as últimas PRESERVE_RECENT mensagens integralmente.
   * @param messages - Array de mensagens a sumarizar
   * @returns Array compactado: [system msgs, pinned, resumo, mensagens recentes]
   */
  summarize(messages: Message[]): Promise<Message[]>
}

/** SummarizationDeps
 * Descrição: Dependências necessárias para criar o serviço de sumarização.
 */
interface SummarizationDeps {
  /** provider - Camada de abstração do LLM para gerar os resumos */
  provider: ProviderLayer
  /** providerId - Identificador do provider LLM (ex: 'vllm-mlx') */
  providerId: string
  /** modelId - Identificador do modelo LLM (ex: 'qwen3-coder-reap-40b-a3b') */
  modelId: string
}

/** createSummarizationService
 * Descrição: Cria uma instância do serviço de sumarização de contexto.
 * Usa o provider LLM para gerar resumos estruturados do histórico de conversa.
 * @param deps - Dependências do serviço (provider, providerId, modelId)
 * @returns Instância do SummarizationService pronta para uso
 */
export function createSummarizationService(deps: SummarizationDeps): SummarizationService {
  return { summarize }

  /** summarize
   * Descrição: Resume mensagens antigas preservando system, pinned e mensagens recentes.
   * @param messages - Array completo de mensagens da conversa
   * @returns Array compactado com resumo gerado pelo LLM
   */
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

  /** splitMessages
   * Descrição: Divide as mensagens em categorias: system, pinned, a comprimir e preservadas.
   * @param messages - Array completo de mensagens da conversa
   * @returns Objeto com as mensagens separadas por categoria
   */
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

  /** callLlm
   * Descrição: Chama o LLM com os prompts de compressão para gerar um resumo.
   * @param inputText - Texto formatado das mensagens a serem resumidas
   * @returns Texto do resumo gerado pelo LLM
   */
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
