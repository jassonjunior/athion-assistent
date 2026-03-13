/** @module telemetry
 * Descrição: Módulo de telemetria OpenTelemetry do Athion.
 * Reexporta a fábrica do serviço de telemetria e todos os tipos relacionados.
 * Telemetria é opt-in — desativada por padrão.
 */

/** createTelemetry - Fábrica do serviço de telemetria (no-op ou OTLP) */
export { createTelemetry } from './telemetry'
/** TelemetryConfig, TelemetryService, SpanContext - Tipos de telemetria */
export type { TelemetryConfig, TelemetryService, SpanContext } from './types'
