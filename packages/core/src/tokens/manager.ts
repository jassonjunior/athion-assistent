import type { SummarizationService } from './summarize'
import type { CompactionStrategy, LoopDetection, TokenBudget, TokenManager } from './types'

/**
 * Configuracao do Token Manager.
 */
interface TokenManagerConfig {
  /** Limite de contexto do modelo em tokens (ex: 50000 para qwen3) */
  contextLimit: number
  /** Estrategia de compactacao (default: 'sliding-window') */
  strategy?: CompactionStrategy
  /** Percentual da janela que dispara compactacao (default: 0.8 = 80%) */
  compactionThreshold?: number
  /** Numero de mensagens recentes a manter no sliding-window (default: 20) */
  windowSize?: number
  /** Minimo de repeticoes para detectar loop (default: 3) */
  loopThreshold?: number
  /** Servico de summarizacao (obrigatorio se strategy = 'summarize') */
  summarizer?: SummarizationService
}

/**
 * Cria uma instancia do Token Manager.
 * Controla budget de tokens, compactacao de historico e deteccao de loops.
 */
export function createTokenManager(config: TokenManagerConfig): TokenManager {
  const strategy = config.strategy ?? 'sliding-window'
  const compactionThreshold = config.compactionThreshold ?? 0.8
  const windowSize = config.windowSize ?? 20
  const loopThreshold = config.loopThreshold ?? 3

  let totalInputTokens = 0
  let totalOutputTokens = 0

  function getBudget(): TokenBudget {
    const used = totalInputTokens + totalOutputTokens
    return {
      contextLimit: config.contextLimit,
      totalInputTokens,
      totalOutputTokens,
      remainingContext: Math.max(0, config.contextLimit - used),
    }
  }

  function trackUsage(inputTokens: number, outputTokens: number): void {
    totalInputTokens += inputTokens
    totalOutputTokens += outputTokens
  }

  function needsCompaction(): boolean {
    const used = totalInputTokens + totalOutputTokens
    return used >= config.contextLimit * compactionThreshold
  }

  async function compact(
    messages: Array<{ role: string; content: string }>,
  ): Promise<Array<{ role: string; content: string }>> {
    if (messages.length <= 2) return messages

    switch (strategy) {
      case 'truncate':
        return compactTruncate(messages)
      case 'sliding-window':
        return compactSlidingWindow(messages)
      case 'summarize':
        return compactSummarize(messages)
    }
  }

  /**
   * Estrategia 'summarize': chama o LLM para gerar resumo estruturado.
   * Se o summarizer nao estiver configurado, faz fallback para sliding-window.
   */
  async function compactSummarize(
    messages: Array<{ role: string; content: string }>,
  ): Promise<Array<{ role: string; content: string }>> {
    if (!config.summarizer) {
      // eslint-disable-next-line no-console
      console.warn('[tokens] Summarizer not configured, falling back to sliding-window')
      return compactSlidingWindow(messages)
    }

    try {
      return await config.summarizer.summarize(messages)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[tokens] Summarization failed, falling back to sliding-window:', err)
      return compactSlidingWindow(messages)
    }
  }

  function compactTruncate(
    messages: Array<{ role: string; content: string }>,
  ): Array<{ role: string; content: string }> {
    const systemMessages = messages.filter((m) => m.role === 'system')
    const recentMessages = messages.filter((m) => m.role !== 'system').slice(-windowSize)
    return [...systemMessages, ...recentMessages]
  }

  function compactSlidingWindow(
    messages: Array<{ role: string; content: string }>,
  ): Array<{ role: string; content: string }> {
    const systemMessages = messages.filter((m) => m.role === 'system')
    const nonSystem = messages.filter((m) => m.role !== 'system')

    if (nonSystem.length <= windowSize) return messages

    const kept = nonSystem.slice(-windowSize)
    const removedCount = nonSystem.length - windowSize

    const compactionNotice = {
      role: 'system',
      content: `[Context compacted: ${removedCount} messages were removed to free context space]`,
    }

    return [...systemMessages, compactionNotice, ...kept]
  }

  function detectLoop(actions: string[]): LoopDetection {
    if (actions.length < loopThreshold) {
      return { detected: false, repetitions: 0 }
    }

    for (let patternLength = 1; patternLength <= 3; patternLength++) {
      const lastPattern = actions.slice(-patternLength)
      let repetitions = 0

      for (let i = actions.length - patternLength; i >= 0; i -= patternLength) {
        const segment = actions.slice(i - patternLength >= 0 ? i - patternLength + 1 : 0, i + 1)
        if (segment.length === patternLength && segment.every((a, idx) => a === lastPattern[idx])) {
          repetitions++
        } else {
          break
        }
      }

      if (repetitions >= loopThreshold) {
        return {
          detected: true,
          repetitions,
          pattern: lastPattern.join(' → '),
        }
      }
    }

    return { detected: false, repetitions: 0 }
  }

  function reset(): void {
    totalInputTokens = 0
    totalOutputTokens = 0
  }

  return { getBudget, trackUsage, needsCompaction, compact, detectLoop, reset }
}
