/** TelemetryConfig
 * Descrição: Configuração da telemetria OpenTelemetry.
 * Telemetria é opt-in, desativada por padrão. Nunca envia dados sem consentimento.
 */
export interface TelemetryConfig {
  /** Se a telemetria está habilitada (default: false — opt-in) */
  enabled: boolean
  /** Endpoint OTLP para envio de traces (ex: http://localhost:4318) */
  endpoint?: string | undefined
  /** Nome do serviço nos traces (default: 'athion-assistent') */
  serviceName: string
  /** Se dados do usuário devem ser anonimizados (default: true) */
  anonymize: boolean
}

/** TelemetryService
 * Descrição: Interface do serviço de telemetria.
 * Fornece métodos para instrumentar operações críticas do Athion.
 */
export interface TelemetryService {
  /** traceChat
   * Descrição: Inicia um span para uma operação de chat completa com o LLM.
   * @param attrs - Atributos do span (sessionId, provider, model)
   * @param callback - Operação a ser instrumentada dentro do span
   * @returns Resultado da operação instrumentada
   */
  traceChat<T>(
    attrs: { sessionId: string; provider: string; model: string },
    callback: (span: SpanContext) => Promise<T>,
  ): Promise<T>

  /** traceLlmCall
   * Descrição: Inicia um span para uma chamada individual ao LLM.
   * @param attrs - Atributos do span (provider, model)
   * @param callback - Operação a ser instrumentada dentro do span
   * @returns Resultado da operação instrumentada
   */
  traceLlmCall<T>(
    attrs: { provider: string; model: string },
    callback: (span: SpanContext) => Promise<T>,
  ): Promise<T>

  /** traceTool
   * Descrição: Inicia um span para execução de uma ferramenta.
   * @param attrs - Atributos do span (toolName)
   * @param callback - Operação a ser instrumentada dentro do span
   * @returns Resultado da operação instrumentada
   */
  traceTool<T>(attrs: { toolName: string }, callback: (span: SpanContext) => Promise<T>): Promise<T>

  /** traceSubAgent
   * Descrição: Inicia um span para spawn e execução de um subagente.
   * @param attrs - Atributos do span (agentName, skill)
   * @param callback - Operação a ser instrumentada dentro do span
   * @returns Resultado da operação instrumentada
   */
  traceSubAgent<T>(
    attrs: { agentName: string; skill: string },
    callback: (span: SpanContext) => Promise<T>,
  ): Promise<T>

  /** recordTokenUsage
   * Descrição: Registra o uso de tokens no span ativo corrente.
   * @param promptTokens - Quantidade de tokens do prompt
   * @param completionTokens - Quantidade de tokens da resposta
   */
  recordTokenUsage(promptTokens: number, completionTokens: number): void

  /** shutdown
   * Descrição: Encerra o SDK de telemetria graciosamente, flushing traces pendentes.
   * @returns Promise que resolve quando o shutdown é concluído
   */
  shutdown(): Promise<void>
}

/** SpanContext
 * Descrição: Contexto de um span ativo.
 * Permite setar atributos e registrar erros durante a execução.
 */
export interface SpanContext {
  /** Define um atributo no span corrente */
  setAttribute(key: string, value: string | number | boolean): void
  /** Marca o span como erro */
  recordError(error: Error): void
}
