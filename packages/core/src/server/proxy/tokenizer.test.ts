import { describe, expect, it } from 'vitest'
import { createTokenizer } from './tokenizer'
import type { OpenAIMessage } from './types'

describe('createTokenizer', () => {
  const tokenizer = createTokenizer()

  describe('countText', () => {
    it('retorna 0 para string vazia', () => {
      expect(tokenizer.countText('')).toBe(0)
    })

    it('conta tokens com ratio de ~4 chars por token', () => {
      // 12 chars / 4 = 3 tokens
      expect(tokenizer.countText('Hello World!')).toBe(3)
    })

    it('arredonda para cima', () => {
      // 5 chars / 4 = 1.25 → ceil = 2
      expect(tokenizer.countText('Hello')).toBe(2)
    })

    it('trata textos longos', () => {
      const text = 'a'.repeat(400)
      expect(tokenizer.countText(text)).toBe(100)
    })
  })

  describe('countMessages', () => {
    it('retorna overhead base para array vazio', () => {
      // CHAT_OVERHEAD = 3
      expect(tokenizer.countMessages([])).toBe(3)
    })

    it('conta uma mensagem simples com overhead', () => {
      const messages: OpenAIMessage[] = [{ role: 'user', content: 'Hello World!' }]
      // CHAT_OVERHEAD(3) + MESSAGE_OVERHEAD(4) + countText("Hello World!")(3) = 10
      expect(tokenizer.countMessages(messages)).toBe(10)
    })

    it('conta multiplas mensagens', () => {
      const messages: OpenAIMessage[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hi' },
      ]
      // CHAT_OVERHEAD(3) + MSG1(4 + ceil(15/4)=4) + MSG2(4 + ceil(2/4)=1) = 3 + 8 + 5 = 16
      expect(tokenizer.countMessages(messages)).toBe(16)
    })

    it('conta mensagens com content null', () => {
      const messages: OpenAIMessage[] = [{ role: 'assistant', content: null }]
      // CHAT_OVERHEAD(3) + MESSAGE_OVERHEAD(4) = 7
      expect(tokenizer.countMessages(messages)).toBe(7)
    })

    it('conta mensagens com tool_calls', () => {
      const messages: OpenAIMessage[] = [
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'tc1',
              type: 'function',
              function: { name: 'read_file', arguments: '{"path":"/foo"}' },
            },
          ],
        },
      ]
      // CHAT_OVERHEAD(3) + MESSAGE_OVERHEAD(4) + countText("read_file")(3) + countText('{"path":"/foo"}')(4) = 14
      expect(tokenizer.countMessages(messages)).toBe(14)
    })

    it('conta mensagens com name', () => {
      const messages: OpenAIMessage[] = [{ role: 'tool', content: 'result', name: 'read_file' }]
      // CHAT_OVERHEAD(3) + MESSAGE_OVERHEAD(4) + countText("result")(2) + countText("read_file")(3) = 12
      expect(tokenizer.countMessages(messages)).toBe(12)
    })
  })
})
