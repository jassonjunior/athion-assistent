import type { SpanContext, TelemetryConfig, TelemetryService } from './types'

/** noopSpanContext
 * Descrição: Cria um SpanContext no-op para quando a telemetria está desabilitada.
 * Todas as operações são passthrough sem nenhum efeito.
 * @returns SpanContext com métodos no-op
 */
function noopSpanContext(): SpanContext {
  return {
    setAttribute: () => undefined,
    recordError: () => undefined,
  }
}

/** createNoopTelemetry
 * Descrição: Cria uma instância no-op do TelemetryService para quando telemetria está desabilitada.
 * Todas as operações são passthrough sem nenhum overhead de instrumentação.
 * @returns Instância do TelemetryService com métodos no-op
 */
function createNoopTelemetry(): TelemetryService {
  async function traceChat<T>(
    _attrs: { sessionId: string; provider: string; model: string },
    callback: (span: SpanContext) => Promise<T>,
  ): Promise<T> {
    return callback(noopSpanContext())
  }

  async function traceLlmCall<T>(
    _attrs: { provider: string; model: string },
    callback: (span: SpanContext) => Promise<T>,
  ): Promise<T> {
    return callback(noopSpanContext())
  }

  async function traceTool<T>(
    _attrs: { toolName: string },
    callback: (span: SpanContext) => Promise<T>,
  ): Promise<T> {
    return callback(noopSpanContext())
  }

  async function traceSubAgent<T>(
    _attrs: { agentName: string; skill: string },
    callback: (span: SpanContext) => Promise<T>,
  ): Promise<T> {
    return callback(noopSpanContext())
  }

  function recordTokenUsage(_promptTokens: number, _completionTokens: number): void {
    // no-op
  }

  async function shutdown(): Promise<void> {
    // no-op
  }

  return { traceChat, traceLlmCall, traceTool, traceSubAgent, recordTokenUsage, shutdown }
}

/** OtelApi
 * Descrição: Tipo auxiliar para as APIs do OpenTelemetry usadas internamente.
 */
type OtelApi = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trace: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SpanStatusCode: any
}

/** initOtelSdk
 * Descrição: Inicializa o SDK OpenTelemetry com exporter OTLP HTTP.
 * Importa dinamicamente os pacotes para evitar overhead quando desabilitado.
 * @param config - Configuração da telemetria com endpoint e nome do serviço
 * @returns Objeto com o SDK, tracer e APIs do OpenTelemetry
 */
async function initOtelSdk(config: TelemetryConfig): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdk: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tracer: any
  api: OtelApi
}> {
  const { NodeSDK } = await import('@opentelemetry/sdk-node')
  const { trace, SpanStatusCode } = await import('@opentelemetry/api')
  const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http')

  const exporter = config.endpoint
    ? new OTLPTraceExporter({ url: `${config.endpoint}/v1/traces` })
    : undefined

  const sdk = new NodeSDK({
    serviceName: config.serviceName,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    traceExporter: exporter as any,
  })
  sdk.start()

  return { sdk, tracer: trace.getTracer(config.serviceName), api: { trace, SpanStatusCode } }
}

/** makeRunInSpan
 * Descrição: Cria as funções de tracing tipadas (traceChat, traceLlmCall, traceTool, traceSubAgent).
 * Cada função inicia um span OpenTelemetry com atributos específicos da operação.
 * @param tracer - Instância do tracer OpenTelemetry
 * @param api - APIs do OpenTelemetry (trace, SpanStatusCode)
 * @param anonymize - Função para anonimizar valores sensíveis
 * @returns Objeto com as funções de tracing
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRunInSpan(tracer: any, api: OtelApi, anonymize: (v: string) => string) {
  async function runInSpan<T>(
    spanName: string,
    attrs: Record<string, string | number | boolean>,
    callback: (span: SpanContext) => Promise<T>,
  ): Promise<T> {
    return tracer.startActiveSpan(spanName, async (otelSpan: any) => {
      // eslint-disable-line @typescript-eslint/no-explicit-any
      for (const [key, val] of Object.entries(attrs)) otelSpan.setAttribute(key, val)
      const spanCtx: SpanContext = {
        setAttribute: (key, val) => otelSpan.setAttribute(key, val),
        recordError: (error) => {
          otelSpan.recordException(error)
          otelSpan.setStatus({ code: api.SpanStatusCode.ERROR, message: error.message })
        },
      }
      try {
        const result = await callback(spanCtx)
        otelSpan.setStatus({ code: api.SpanStatusCode.OK })
        return result
      } catch (error) {
        if (error instanceof Error) spanCtx.recordError(error)
        throw error
      } finally {
        otelSpan.end()
      }
    })
  }

  return {
    traceChat: <T>(
      attrs: { sessionId: string; provider: string; model: string },
      cb: (s: SpanContext) => Promise<T>,
    ) =>
      runInSpan(
        'athion.chat',
        {
          'session.id': anonymize(attrs.sessionId),
          'llm.provider': attrs.provider,
          'llm.model': attrs.model,
        },
        cb,
      ),
    traceLlmCall: <T>(
      attrs: { provider: string; model: string },
      cb: (s: SpanContext) => Promise<T>,
    ) =>
      runInSpan(
        'athion.llm.call',
        { 'llm.provider': attrs.provider, 'llm.model': attrs.model },
        cb,
      ),
    traceTool: <T>(attrs: { toolName: string }, cb: (s: SpanContext) => Promise<T>) =>
      runInSpan('athion.tool.execute', { 'tool.name': attrs.toolName }, cb),
    traceSubAgent: <T>(
      attrs: { agentName: string; skill: string },
      cb: (s: SpanContext) => Promise<T>,
    ) =>
      runInSpan(
        'athion.subagent.spawn',
        { 'agent.name': attrs.agentName, 'agent.skill': attrs.skill },
        cb,
      ),
  }
}

/** createOtelTelemetry
 * Descrição: Cria uma instância real do TelemetryService com instrumentação OpenTelemetry.
 * Importa os pacotes OTEL dinamicamente para evitar overhead quando desabilitado.
 * @param config - Configuração da telemetria (endpoint, serviceName, anonymize)
 * @returns Instância do TelemetryService com instrumentação real
 */
async function createOtelTelemetry(config: TelemetryConfig): Promise<TelemetryService> {
  const { sdk, tracer, api } = await initOtelSdk(config)
  const anonymize = (value: string) => (config.anonymize ? value.substring(0, 8) + '...' : value)
  const tracers = makeRunInSpan(tracer, api, anonymize)

  function recordTokenUsage(promptTokens: number, completionTokens: number): void {
    const activeSpan = api.trace.getActiveSpan()
    if (activeSpan) {
      activeSpan.setAttribute('llm.usage.prompt_tokens', promptTokens)
      activeSpan.setAttribute('llm.usage.completion_tokens', completionTokens)
      activeSpan.setAttribute('llm.usage.total_tokens', promptTokens + completionTokens)
    }
  }

  return { ...tracers, recordTokenUsage, shutdown: () => sdk.shutdown() }
}

/** createTelemetry
 * Descrição: Cria uma instância do TelemetryService.
 * Retorna implementação no-op se desabilitado, ou instrumentação real com OTLP se habilitado.
 * @param config - Configuração da telemetria (enabled, endpoint, serviceName, anonymize)
 * @returns Instância do TelemetryService
 */
export async function createTelemetry(config: TelemetryConfig): Promise<TelemetryService> {
  if (!config.enabled) {
    return createNoopTelemetry()
  }

  return createOtelTelemetry(config)
}
