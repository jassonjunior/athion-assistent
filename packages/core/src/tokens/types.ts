/**
 * Orçamento de tokens para uma sessão.
 * Rastreia uso acumulado e limites.
 */
export interface TokenBudget {
  /** Limite máximo de tokens de contexto (janela do modelo) */
  contextLimit: number
  /** Total de tokens de input consumidos na sessão */
  totalInputTokens: number
  /** Total de tokens de output consumidos na sessão */
  totalOutputTokens: number
  /** Tokens restantes estimados no contexto */
  remainingContext: number
}

/**
 * Estratégia de compactação do histórico de mensagens.
 * - 'summarize': Resume mensagens antigas em um resumo conciso
 * - 'truncate': Remove mensagens mais antigas mantendo as recentes
 * - 'sliding-window': Mantém uma janela fixa das últimas N mensagens
 */
export type CompactionStrategy = 'summarize' | 'truncate' | 'sliding-window'

/**
 * Resultado da detecção de loop.
 * Indica se o LLM está preso em um ciclo repetitivo.
 */
export interface LoopDetection {
  /** Se um loop foi detectado */
  detected: boolean
  /** Número de repetições encontradas */
  repetitions: number
  /** Padrão repetido (se detectado) */
  pattern?: string
}

/**
 * Interface do Token Manager.
 * Centraliza controle de budget, compactação e detecção de loops.
 */
export interface TokenManager {
  /**
   * Retorna o budget atual da sessão.
   * @returns Estado atual do orçamento de tokens
   */
  getBudget(): TokenBudget

  /**
   * Registra tokens consumidos em uma chamada ao LLM.
   * @param inputTokens - Tokens de input (prompt) consumidos
   * @param outputTokens - Tokens de output (resposta) consumidos
   */
  trackUsage(inputTokens: number, outputTokens: number): void

  /**
   * Verifica se é necessário compactar o histórico.
   * Retorna true quando o uso ultrapassa o threshold configurado.
   * @returns true se compactação é necessária
   */
  needsCompaction(): boolean

  /**
   * Compacta o histórico de mensagens segundo a estratégia configurada.
   * @param messages - Array de mensagens a compactar
   * @returns Array compactado de mensagens
   */
  compact(
    messages: Array<{ role: string; content: string }>,
  ): Array<{ role: string; content: string }>

  /**
   * Verifica se o LLM está preso em um loop de tool calls.
   * Analisa as últimas ações para detectar padrões repetitivos.
   * @param actions - Array com os nomes das últimas ações executadas
   * @returns Resultado da detecção de loop
   */
  detectLoop(actions: string[]): LoopDetection

  /**
   * Reseta os contadores de tokens (para nova sessão).
   */
  reset(): void
}
