import { isPinnedMessage } from './summarize'
import type { SummarizationService } from './summarize'
import type { CompactionStrategy, LoopDetection, TokenBudget, TokenManager } from './types'

/** TokenManagerConfig
 * Descrição: Configuração para criação de uma instância do Token Manager.
 * Define limites de contexto, estratégia de compactação e parâmetros de detecção de loops.
 */
interface TokenManagerConfig {
  /** contextLimit - Limite de contexto do modelo em tokens (ex: 50000 para qwen3) */
  contextLimit: number
  /** strategy - Estratégia de compactação do histórico (default: 'sliding-window') */
  strategy?: CompactionStrategy
  /** compactionThreshold - Percentual da janela que dispara compactação (default: 0.8 = 80%) */
  compactionThreshold?: number
  /** windowSize - Número de mensagens recentes a manter no sliding-window (default: 20) */
  windowSize?: number
  /** loopThreshold - Mínimo de repetições para detectar loop (default: 3) */
  loopThreshold?: number
  /** summarizer - Serviço de sumarização (obrigatório se strategy = 'summarize') */
  summarizer?: SummarizationService
}

/** createTokenManager
 * Descrição: Cria uma instância do Token Manager para controle de budget de tokens,
 * compactação de histórico de mensagens e detecção de loops repetitivos do LLM.
 * @param config - Configuração do Token Manager (limites, estratégia, thresholds)
 * @returns Instância do TokenManager pronta para uso
 */
export function createTokenManager(config: TokenManagerConfig): TokenManager {
  const strategy = config.strategy ?? 'sliding-window'
  const compactionThreshold = config.compactionThreshold ?? 0.8
  const windowSize = config.windowSize ?? 20
  const loopThreshold = config.loopThreshold ?? 3

  let totalInputTokens = 0
  let totalOutputTokens = 0

  /** getBudget
   * Descrição: Retorna o estado atual do orçamento de tokens da sessão.
   * @returns Objeto com limites, consumo e tokens restantes
   */
  function getBudget(): TokenBudget {
    const used = totalInputTokens + totalOutputTokens
    return {
      contextLimit: config.contextLimit,
      totalInputTokens,
      totalOutputTokens,
      remainingContext: Math.max(0, config.contextLimit - used),
    }
  }

  /** trackUsage
   * Descrição: Registra tokens consumidos em uma chamada ao LLM.
   * @param inputTokens - Quantidade de tokens de input (prompt) consumidos
   * @param outputTokens - Quantidade de tokens de output (resposta) consumidos
   */
  function trackUsage(inputTokens: number, outputTokens: number): void {
    totalInputTokens += inputTokens
    totalOutputTokens += outputTokens
  }

  /** needsCompaction
   * Descrição: Verifica se o uso de tokens ultrapassou o threshold de compactação.
   * @returns true se compactação é necessária
   */
  function needsCompaction(): boolean {
    const used = totalInputTokens + totalOutputTokens
    return used >= config.contextLimit * compactionThreshold
  }

  /** compact
   * Descrição: Compacta o histórico de mensagens segundo a estratégia configurada.
   * @param messages - Array de mensagens a compactar
   * @returns Array compactado de mensagens
   */
  async function compact(
    messages: Array<{ role: string; content: string }>,
  ): Promise<Array<{ role: string; content: string }>> {
    if (messages.length <= 2) return messages
    if (strategy === 'truncate') return truncateMessages(messages, windowSize)
    if (strategy === 'sliding-window') return slidingWindow(messages, windowSize)
    return compactSummarize(messages, config.summarizer, windowSize)
  }

  /** detectLoop
   * Descrição: Verifica se o LLM está preso em um loop de ações repetitivas.
   * @param actions - Array com os nomes das últimas ações executadas
   * @returns Resultado da detecção com flag, repetições e padrão encontrado
   */
  function detectLoop(actions: string[]): LoopDetection {
    return detectLoopPattern(actions, loopThreshold)
  }

  /** reset
   * Descrição: Reseta os contadores de tokens para zero (nova sessão).
   */
  function reset(): void {
    totalInputTokens = 0
    totalOutputTokens = 0
  }

  return { getBudget, trackUsage, needsCompaction, compact, detectLoop, reset }
}

/** Msg
 * Descrição: Tipo auxiliar para representar uma mensagem com role e content.
 */
type Msg = { role: string; content: string }

/** compactSummarize
 * Descrição: Compacta mensagens usando sumarização via LLM.
 * Faz fallback para sliding-window se o summarizer não estiver configurado ou falhar.
 * @param messages - Array de mensagens a compactar
 * @param summarizer - Serviço de sumarização (pode ser undefined)
 * @param windowSize - Tamanho da janela de mensagens recentes a preservar
 * @returns Array compactado de mensagens
 */
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

/** truncateMessages
 * Descrição: Remove mensagens antigas mantendo apenas as mais recentes e mensagens de sistema.
 * @param messages - Array de mensagens a truncar
 * @param windowSize - Número de mensagens não-system a manter
 * @returns Array truncado com system messages + mensagens recentes
 */
function truncateMessages(messages: Msg[], windowSize: number): Msg[] {
  const system = messages.filter((m) => m.role === 'system')
  const recent = messages.filter((m) => m.role !== 'system').slice(-windowSize)
  return [...system, ...recent]
}

/** slidingWindow
 * Descrição: Mantém uma janela fixa das últimas N mensagens, preservando system e pinned.
 * Adiciona uma mensagem de aviso indicando quantas mensagens foram removidas.
 * @param messages - Array de mensagens a compactar
 * @param windowSize - Número de mensagens recentes a manter
 * @returns Array com system + pinned + aviso + mensagens recentes
 */
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

/** detectLoopPattern
 * Descrição: Detecta padrões repetitivos em uma sequência de ações.
 * Verifica padrões de comprimento 1 a 3 ações.
 * @param actions - Array com os nomes das últimas ações executadas
 * @param loopThreshold - Número mínimo de repetições para considerar como loop
 * @returns Resultado com flag de detecção, contagem de repetições e padrão encontrado
 */
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
