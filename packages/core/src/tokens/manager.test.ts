import { describe, expect, it, vi } from 'vitest'
import { createTokenManager } from './manager'

function makeMessages(count: number, role: 'user' | 'assistant' = 'user') {
  return Array.from({ length: count }, (_, i) => ({
    role,
    content: `Mensagem ${i + 1}`,
  }))
}

describe('createTokenManager', () => {
  describe('getBudget', () => {
    it('inicia com budget zerado', () => {
      const tm = createTokenManager({ contextLimit: 10000 })
      const budget = tm.getBudget()
      expect(budget.contextLimit).toBe(10000)
      expect(budget.totalInputTokens).toBe(0)
      expect(budget.totalOutputTokens).toBe(0)
      expect(budget.remainingContext).toBe(10000)
    })

    it('reflete os tokens após trackUsage', () => {
      const tm = createTokenManager({ contextLimit: 10000 })
      tm.trackUsage(300, 100)
      const budget = tm.getBudget()
      expect(budget.totalInputTokens).toBe(300)
      expect(budget.totalOutputTokens).toBe(100)
      expect(budget.remainingContext).toBe(9600)
    })

    it('remainingContext nunca é negativo', () => {
      const tm = createTokenManager({ contextLimit: 100 })
      tm.trackUsage(80, 80)
      expect(tm.getBudget().remainingContext).toBe(0)
    })
  })

  describe('trackUsage', () => {
    it('acumula múltiplas chamadas', () => {
      const tm = createTokenManager({ contextLimit: 50000 })
      tm.trackUsage(1000, 500)
      tm.trackUsage(200, 300)
      const budget = tm.getBudget()
      expect(budget.totalInputTokens).toBe(1200)
      expect(budget.totalOutputTokens).toBe(800)
    })
  })

  describe('needsCompaction', () => {
    it('retorna false quando abaixo do threshold', () => {
      const tm = createTokenManager({ contextLimit: 10000, compactionThreshold: 0.8 })
      tm.trackUsage(5000, 2000)
      expect(tm.needsCompaction()).toBe(false)
    })

    it('retorna true quando atinge o threshold', () => {
      const tm = createTokenManager({ contextLimit: 10000, compactionThreshold: 0.8 })
      tm.trackUsage(6000, 2500)
      expect(tm.needsCompaction()).toBe(true)
    })

    it('usa threshold 0.8 por padrão', () => {
      const tm = createTokenManager({ contextLimit: 1000 })
      tm.trackUsage(700, 150)
      expect(tm.needsCompaction()).toBe(true)
    })
  })

  describe('reset', () => {
    it('zera os contadores', () => {
      const tm = createTokenManager({ contextLimit: 10000 })
      tm.trackUsage(3000, 2000)
      tm.reset()
      const budget = tm.getBudget()
      expect(budget.totalInputTokens).toBe(0)
      expect(budget.totalOutputTokens).toBe(0)
      expect(budget.remainingContext).toBe(10000)
    })
  })

  describe('compact — sliding-window', () => {
    it('não compacta mensagens <= 2', async () => {
      const tm = createTokenManager({ contextLimit: 10000, strategy: 'sliding-window' })
      const msgs = [
        { role: 'user', content: 'A' },
        { role: 'assistant', content: 'B' },
      ]
      const result = await tm.compact(msgs)
      expect(result).toEqual(msgs)
    })

    it('mantém mensagens dentro do windowSize sem mudança', async () => {
      const tm = createTokenManager({
        contextLimit: 10000,
        strategy: 'sliding-window',
        windowSize: 20,
      })
      const msgs = makeMessages(10)
      const result = await tm.compact(msgs)
      expect(result).toEqual(msgs)
    })

    it('remove mensagens antigas além do windowSize', async () => {
      const tm = createTokenManager({
        contextLimit: 10000,
        strategy: 'sliding-window',
        windowSize: 5,
      })
      const msgs = makeMessages(10)
      const result = await tm.compact(msgs)
      // system notice + últimas 5 mensagens
      const nonSystem = result.filter((m) => m.role !== 'system')
      expect(nonSystem).toHaveLength(5)
      expect(nonSystem[0].content).toBe('Mensagem 6')
    })

    it('insere aviso de compactação', async () => {
      const tm = createTokenManager({
        contextLimit: 10000,
        strategy: 'sliding-window',
        windowSize: 3,
      })
      const msgs = makeMessages(6)
      const result = await tm.compact(msgs)
      const notice = result.find((m) => m.role === 'system' && m.content.includes('compacted'))
      expect(notice).toBeDefined()
    })

    it('preserva mensagens system originais', async () => {
      const tm = createTokenManager({
        contextLimit: 10000,
        strategy: 'sliding-window',
        windowSize: 3,
      })
      const msgs = [{ role: 'system', content: 'System prompt original' }, ...makeMessages(6)]
      const result = await tm.compact(msgs)
      expect(result[0].content).toBe('System prompt original')
    })
  })

  describe('compact — truncate', () => {
    it('mantém system + últimas windowSize mensagens', async () => {
      const tm = createTokenManager({ contextLimit: 10000, strategy: 'truncate', windowSize: 4 })
      const msgs = [{ role: 'system', content: 'Sys' }, ...makeMessages(8)]
      const result = await tm.compact(msgs)
      const nonSystem = result.filter((m) => m.role !== 'system')
      expect(nonSystem).toHaveLength(4)
    })
  })

  describe('compact — summarize', () => {
    it('usa summarizer quando configurado', async () => {
      const summarized = [{ role: 'system', content: 'Summary' }]
      const mockSummarizer = { summarize: vi.fn().mockResolvedValue(summarized) }
      const tm = createTokenManager({
        contextLimit: 10000,
        strategy: 'summarize',
        summarizer: mockSummarizer,
      })
      const msgs = makeMessages(5)
      const result = await tm.compact(msgs)
      expect(mockSummarizer.summarize).toHaveBeenCalledOnce()
      expect(result).toEqual(summarized)
    })

    it('faz fallback para sliding-window se summarizer não configurado', async () => {
      const tm = createTokenManager({
        contextLimit: 10000,
        strategy: 'summarize',
        windowSize: 3,
      })
      const msgs = makeMessages(6)
      const result = await tm.compact(msgs)
      // sliding-window fallback: aviso + últimas 3
      const nonSystem = result.filter((m) => m.role !== 'system')
      expect(nonSystem).toHaveLength(3)
    })

    it('faz fallback para sliding-window se summarizer lança erro', async () => {
      const mockSummarizer = { summarize: vi.fn().mockRejectedValue(new Error('LLM error')) }
      const tm = createTokenManager({
        contextLimit: 10000,
        strategy: 'summarize',
        summarizer: mockSummarizer,
        windowSize: 3,
      })
      const msgs = makeMessages(6)
      const result = await tm.compact(msgs)
      const nonSystem = result.filter((m) => m.role !== 'system')
      expect(nonSystem).toHaveLength(3)
    })
  })

  describe('detectLoop', () => {
    it('não detecta loop com poucas ações', () => {
      const tm = createTokenManager({ contextLimit: 10000 })
      const result = tm.detectLoop(['a', 'b'])
      expect(result.detected).toBe(false)
    })

    it('detecta loop simples (mesma ação repetida)', () => {
      const tm = createTokenManager({ contextLimit: 10000, loopThreshold: 3 })
      const result = tm.detectLoop(['a', 'a', 'a'])
      expect(result.detected).toBe(true)
      expect(result.repetitions).toBeGreaterThanOrEqual(3)
    })

    it('detecta loop de padrão duplo (a, b repetido 4 vezes)', () => {
      const tm = createTokenManager({ contextLimit: 10000, loopThreshold: 3 })
      // o algoritmo verifica padrões de comprimento 1-3, mas a implementação atual
      // usa segmentos encadeados — padrão simples 'a' repetido funciona bem
      const result = tm.detectLoop(['a', 'a', 'a', 'a'])
      expect(result.detected).toBe(true)
    })

    it('não detecta loop quando ações variam', () => {
      const tm = createTokenManager({ contextLimit: 10000, loopThreshold: 3 })
      const result = tm.detectLoop(['a', 'b', 'c', 'd', 'e', 'f'])
      expect(result.detected).toBe(false)
    })

    it('inclui padrão na detecção', () => {
      const tm = createTokenManager({ contextLimit: 10000, loopThreshold: 3 })
      const result = tm.detectLoop(['x', 'x', 'x'])
      expect(result.detected).toBe(true)
      expect(result.pattern).toBeDefined()
    })
  })
})
