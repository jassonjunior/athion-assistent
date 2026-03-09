/**
 * Configuração da telemetria OpenTelemetry.
 * Telemetria é OPT-IN — desativada por padrão.
 * Nunca envia dados sem consentimento explícito do usuário.
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

/**
 * Interface do serviço de telemetria.
 * Fornece métodos para instrumentar operações críticas do Athion.
 */
export interface TelemetryService {
  /**
   * Inicia um span para uma operação LLM completa.
   * @param sessionId - ID da sessão (anonimizado se anonymize=true)
   * @param callback - Operação a ser instrumentada
   */
  traceChat<T>(
    attrs: { sessionId: string; provider: string; model: string },
    callback: (span: SpanContext) => Promise<T>,
  ): Promise<T>

  /**
   * Inicia um span para uma chamada ao LLM.
   */
  traceLlmCall<T>(
    attrs: { provider: string; model: string },
    callback: (span: SpanContext) => Promise<T>,
  ): Promise<T>

  /**
   * Inicia um span para execução de uma tool.
   */
  traceTool<T>(attrs: { toolName: string }, callback: (span: SpanContext) => Promise<T>): Promise<T>

  /**
   * Inicia um span para spawn de subagente.
   */
  traceSubAgent<T>(
    attrs: { agentName: string; skill: string },
    callback: (span: SpanContext) => Promise<T>,
  ): Promise<T>

  /**
   * Registra uso de tokens em um span ativo.
   */
  recordTokenUsage(promptTokens: number, completionTokens: number): void

  /**
   * Encerra o SDK de telemetria graciosamente.
   */
  shutdown(): Promise<void>
}

/**
 * Contexto de um span ativo — permite setar atributos durante a execução.
 */
export interface SpanContext {
  /** Define um atributo no span corrente */
  setAttribute(key: string, value: string | number | boolean): void
  /** Marca o span como erro */
  recordError(error: Error): void
}
