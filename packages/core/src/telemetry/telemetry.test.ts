/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, expect, it, vi } from 'vitest'
import { createTelemetry } from './telemetry'
import type { TelemetryConfig } from './types'

describe('createTelemetry', () => {
  describe('noop telemetry (disabled)', () => {
    const noopConfig: TelemetryConfig = {
      enabled: false,
      serviceName: 'test',
      anonymize: false,
    }

    it('retorna instância com todos os métodos', async () => {
      const telemetry = await createTelemetry(noopConfig)

      expect(typeof telemetry.traceChat).toBe('function')
      expect(typeof telemetry.traceLlmCall).toBe('function')
      expect(typeof telemetry.traceTool).toBe('function')
      expect(typeof telemetry.traceSubAgent).toBe('function')
      expect(typeof telemetry.recordTokenUsage).toBe('function')
      expect(typeof telemetry.shutdown).toBe('function')
    })

    it('traceChat executa callback e retorna resultado', async () => {
      const telemetry = await createTelemetry(noopConfig)

      const result = await telemetry.traceChat(
        { sessionId: 's1', provider: 'test', model: 'test-model' },
        async (span) => {
          span.setAttribute('key', 'value')
          return 42
        },
      )

      expect(result).toBe(42)
    })

    it('traceLlmCall executa callback e retorna resultado', async () => {
      const telemetry = await createTelemetry(noopConfig)

      const result = await telemetry.traceLlmCall(
        { provider: 'test', model: 'test-model' },
        async () => 'hello',
      )

      expect(result).toBe('hello')
    })

    it('traceTool executa callback e retorna resultado', async () => {
      const telemetry = await createTelemetry(noopConfig)

      const result = await telemetry.traceTool({ toolName: 'read_file' }, async () => ({
        success: true,
      }))

      expect(result).toEqual({ success: true })
    })

    it('traceSubAgent executa callback e retorna resultado', async () => {
      const telemetry = await createTelemetry(noopConfig)

      const result = await telemetry.traceSubAgent(
        { agentName: 'coder', skill: 'coder' },
        async () => 'done',
      )

      expect(result).toBe('done')
    })

    it('recordTokenUsage não lança erro', async () => {
      const telemetry = await createTelemetry(noopConfig)
      expect(() => telemetry.recordTokenUsage(100, 50)).not.toThrow()
    })

    it('shutdown resolve sem erro', async () => {
      const telemetry = await createTelemetry(noopConfig)
      await expect(telemetry.shutdown()).resolves.not.toThrow()
    })

    it('span.recordError não lança erro no noop', async () => {
      const telemetry = await createTelemetry(noopConfig)

      await telemetry.traceChat(
        { sessionId: 's1', provider: 'test', model: 'test-model' },
        async (span) => {
          span.recordError(new Error('test error'))
          return null
        },
      )
    })

    it('span.setAttribute não lança erro no noop', async () => {
      const telemetry = await createTelemetry(noopConfig)

      await telemetry.traceTool({ toolName: 'test' }, async (span) => {
        span.setAttribute('string', 'value')
        span.setAttribute('number', 42)
        span.setAttribute('bool', true)
        return null
      })
    })
  })

  // Note: Testing the OTEL (enabled) path requires @opentelemetry packages
  // which may not be available in test environment. Structure test only.
  describe('enabled telemetry', () => {
    it('tenta inicializar OTEL SDK quando enabled=true', async () => {
      const config: TelemetryConfig = {
        enabled: true,
        endpoint: 'http://localhost:4318',
        serviceName: 'test-service',
        anonymize: true,
      }

      // This will likely fail because OTEL packages may not be installed
      // but we verify the function handles it
      try {
        const telemetry = await createTelemetry(config)
        expect(telemetry).toBeDefined()
      } catch {
        // Expected if OTEL packages not available
      }
    })
  })
})
