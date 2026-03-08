import type { OpenAIMessage } from './types'

/** Interface do Tokenizer.
 * @typedef {Object} Tokenizer
 * @property {function} countMessages - Conta tokens de uma lista de mensagens.
 * @property {function} countText - Conta tokens de um texto.
 */
export interface Tokenizer {
  /** Conta tokens de uma lista de mensagens */
  countMessages(messages: OpenAIMessage[]): number
  /** Conta tokens de um texto */
  countText(text: string): number
}

/** Ratio chars-para-tokens para estimativa.
 * @constant {number} CHARS_PER_TOKEN - Ratio chars-para-tokens para estimativa.
 * @example
 * const charsPerToken = 4
 */
const CHARS_PER_TOKEN = 4

/** Overhead por mensagem (role, separadores).
 * @constant {number} MESSAGE_OVERHEAD - Overhead por mensagem (role, separadores).
 * @example
 * const messageOverhead = 4
 */
const MESSAGE_OVERHEAD = 4

/** Overhead base do chat (system tokens).
 * @constant {number} CHAT_OVERHEAD - Overhead base do chat (system tokens).
 * @example
 * const chatOverhead = 3
 */
const CHAT_OVERHEAD = 3

/**
 * Cria um Tokenizer com estimativa baseada em caracteres.
 * Usa ratio de ~4 chars por token (fallback do HuggingFace).
 * @returns Tokenizer
 */
export function createTokenizer(): Tokenizer {
  function countText(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN)
  }

  /** Conta tokens de uma lista de mensagens.
   * @param {OpenAIMessage[]} messages - Lista de mensagens.
   * @returns {number} Quantidade de tokens.
   * @example
   * const messages: OpenAIMessage[] = [{ role: 'user', content: 'Hello, how are you?' }]
   * const tokens = countMessages(messages)
   * console.log(tokens) // 1
   */
  function countMessages(messages: OpenAIMessage[]): number {
    let total = CHAT_OVERHEAD
    for (const msg of messages) {
      total += MESSAGE_OVERHEAD
      if (msg.content) {
        total += countText(msg.content)
      }
      if (msg.tool_calls) {
        for (const tc of msg.tool_calls) {
          total += countText(tc.function.name)
          total += countText(tc.function.arguments)
        }
      }
      if (msg.name) {
        total += countText(msg.name)
      }
    }
    return total
  }

  return { countMessages, countText }
}
