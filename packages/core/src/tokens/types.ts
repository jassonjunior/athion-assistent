/** TokenBudget
 * Descrição: Orçamento de tokens para uma sessão.
 * Rastreia uso acumulado e limites de contexto.
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

/** CompactionStrategy
 * Descrição: Estratégia de compactação do histórico de mensagens.
 * 'summarize' resume via LLM, 'truncate' remove antigas, 'sliding-window' mantém janela fixa.
 */
export type CompactionStrategy = 'summarize' | 'truncate' | 'sliding-window'

/** LoopDetection
 * Descrição: Resultado da detecção de loop.
 * Indica se o LLM está preso em um ciclo repetitivo de ações.
 */
export interface LoopDetection {
  /** Se um loop foi detectado */
  detected: boolean
  /** Número de repetições encontradas */
  repetitions: number
  /** Padrão repetido (se detectado) */
  pattern?: string
}

/** TokenManager
 * Descrição: Interface do gerenciador de tokens.
 * Centraliza controle de budget, compactação de histórico e detecção de loops.
 */
export interface TokenManager {
  /** getBudget
   * Descrição: Retorna o budget atual da sessão.
   * @returns Estado atual do orçamento de tokens
   */
  getBudget(): TokenBudget

  /** trackUsage
   * Descrição: Registra tokens consumidos em uma chamada ao LLM.
   * @param inputTokens - Tokens de input (prompt) consumidos
   * @param outputTokens - Tokens de output (resposta) consumidos
   */
  trackUsage(inputTokens: number, outputTokens: number): void

  /** needsCompaction
   * Descrição: Verifica se é necessário compactar o histórico.
   * @returns true se compactação é necessária (uso > threshold)
   */
  needsCompaction(): boolean

  /** compact
   * Descrição: Compacta o histórico de mensagens segundo a estratégia configurada.
   * Async porque a estratégia 'summarize' chama o LLM.
   * @param messages - Array de mensagens a compactar
   * @returns Array compactado de mensagens
   */
  compact(
    messages: Array<{ role: string; content: string }>,
  ): Promise<Array<{ role: string; content: string }>>

  /** detectLoop
   * Descrição: Verifica se o LLM está preso em um loop de tool calls.
   * @param actions - Array com os nomes das últimas ações executadas
   * @returns Resultado da detecção de loop
   */
  detectLoop(actions: string[]): LoopDetection

  /** reset
   * Descrição: Reseta os contadores de tokens para uma nova sessão.
   */
  reset(): void
}
