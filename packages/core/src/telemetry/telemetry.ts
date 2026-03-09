import type { SpanContext, TelemetryConfig, TelemetryService } from './types'

/**
 * Cria um SpanContext no-op (quando telemetria está desabilitada).
 */
function noopSpanContext(): SpanContext {
  return {
    setAttribute: () => undefined,
    recordError: () => undefined,
  }
}

/**
 * Cria uma instância no-op do TelemetryService.
 * Usado quando telemetria está desabilitada (opt-out).
 * Todas as operações são passthrough sem overhead.
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

type OtelApi = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trace: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  SpanStatusCode: any
}

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

/**
 * Cria uma instância real do TelemetryService com OpenTelemetry.
 * Importa dinamicamente para não adicionar overhead quando desabilitado.
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

/**
 * Cria uma instância do TelemetryService.
 *
 * Se telemetria está desabilitada (config.enabled=false), retorna uma implementação
 * no-op com zero overhead. A implementação real só é carregada quando opt-in.
 *
 * @param config - Configuração da telemetria
 * @returns Promise com instância do TelemetryService
 * @example
 * const telemetry = await createTelemetry({ enabled: false, serviceName: 'athion', anonymize: true })
 * // → no-op, sem overhead
 *
 * const telemetry = await createTelemetry({ enabled: true, endpoint: 'http://localhost:4318', ... })
 * // → instrumentação real com OTLP
 */
export async function createTelemetry(config: TelemetryConfig): Promise<TelemetryService> {
  if (!config.enabled) {
    return createNoopTelemetry()
  }

  return createOtelTelemetry(config)
}
