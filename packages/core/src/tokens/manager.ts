import { isPinnedMessage } from './summarize'
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
    if (strategy === 'truncate') return truncateMessages(messages, windowSize)
    if (strategy === 'sliding-window') return slidingWindow(messages, windowSize)
    return compactSummarize(messages, config.summarizer, windowSize)
  }

  function detectLoop(actions: string[]): LoopDetection {
    return detectLoopPattern(actions, loopThreshold)
  }

  function reset(): void {
    totalInputTokens = 0
    totalOutputTokens = 0
  }

  return { getBudget, trackUsage, needsCompaction, compact, detectLoop, reset }
}

type Msg = { role: string; content: string }

async function compactSummarize(
  messages: Msg[],
  summarizer: SummarizationService | undefined,
  windowSize: number,
): Promise<Msg[]> {
  if (!summarizer) {
    // eslint-disable-next-line no-console
    console.warn('[tokens] Summarizer not configured, falling back to sliding-window')
    return slidingWindow(messages, windowSize)
  }
  try {
    return await summarizer.summarize(messages)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[tokens] Summarization failed, falling back to sliding-window:', err)
    return slidingWindow(messages, windowSize)
  }
}

function truncateMessages(messages: Msg[], windowSize: number): Msg[] {
  const system = messages.filter((m) => m.role === 'system')
  const recent = messages.filter((m) => m.role !== 'system').slice(-windowSize)
  return [...system, ...recent]
}

function slidingWindow(messages: Msg[], windowSize: number): Msg[] {
  const system = messages.filter((m) => m.role === 'system')
  const pinned = messages.filter((m) => m.role !== 'system' && isPinnedMessage(m))
  const rest = messages.filter((m) => m.role !== 'system' && !isPinnedMessage(m))
  if (rest.length <= windowSize) return messages
  const kept = rest.slice(-windowSize)
  const notice = {
    role: 'system',
    content: `[Context compacted: ${rest.length - windowSize} messages removed]`,
  }
  return [...system, ...pinned, notice, ...kept]
}

function detectLoopPattern(actions: string[], loopThreshold: number): LoopDetection {
  if (actions.length < loopThreshold) return { detected: false, repetitions: 0 }
  for (let len = 1; len <= 3; len++) {
    const pattern = actions.slice(-len)
    let reps = 0
    for (let i = actions.length - len; i >= 0; i -= len) {
      const seg = actions.slice(Math.max(0, i - len + 1), i + 1)
      if (seg.length === len && seg.every((a, idx) => a === pattern[idx])) reps++
      else break
    }
    if (reps >= loopThreshold)
      return { detected: true, repetitions: reps, pattern: pattern.join(' → ') }
  }
  return { detected: false, repetitions: 0 }
}
