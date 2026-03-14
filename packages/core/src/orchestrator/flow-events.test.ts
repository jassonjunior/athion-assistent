import { describe, expect, it, vi } from 'vitest'
import { createBus } from '../bus/bus'
import { flowEvent, createFlowEvent, flowEventSchema, flowEventTypes } from './flow-events'
import type { FlowEventData } from './flow-events'

describe('flow-events', () => {
  describe('flowEventTypes', () => {
    it('deve conter todos os 15 tipos de evento', () => {
      expect(flowEventTypes).toHaveLength(15)
      expect(flowEventTypes).toContain('user_message')
      expect(flowEventTypes).toContain('system_prompt')
      expect(flowEventTypes).toContain('llm_content')
      expect(flowEventTypes).toContain('tool_call')
      expect(flowEventTypes).toContain('tool_result')
      expect(flowEventTypes).toContain('subagent_start')
      expect(flowEventTypes).toContain('subagent_content')
      expect(flowEventTypes).toContain('subagent_tool_call')
      expect(flowEventTypes).toContain('subagent_tool_result')
      expect(flowEventTypes).toContain('subagent_continuation')
      expect(flowEventTypes).toContain('subagent_complete')
      expect(flowEventTypes).toContain('model_loading')
      expect(flowEventTypes).toContain('model_ready')
      expect(flowEventTypes).toContain('finish')
      expect(flowEventTypes).toContain('error')
    })
  })

  describe('createFlowEvent', () => {
    it('deve criar evento com id e timestamp automaticos', () => {
      const evt = createFlowEvent('user_message', { content: 'hello' })

      expect(evt.id).toBeDefined()
      expect(typeof evt.id).toBe('string')
      expect(evt.id.length).toBeGreaterThan(0)
      expect(evt.type).toBe('user_message')
      expect(evt.timestamp).toBeGreaterThan(0)
      expect(evt.data).toEqual({ content: 'hello' })
      expect(evt.parentId).toBeUndefined()
    })

    it('deve incluir parentId quando fornecido', () => {
      const evt = createFlowEvent('subagent_content', { text: 'abc' }, 'parent-123')

      expect(evt.parentId).toBe('parent-123')
      expect(evt.type).toBe('subagent_content')
    })

    it('deve gerar ids unicos a cada chamada', () => {
      const evt1 = createFlowEvent('llm_content', { content: 'a' })
      const evt2 = createFlowEvent('llm_content', { content: 'b' })

      expect(evt1.id).not.toBe(evt2.id)
    })
  })

  describe('flowEventSchema', () => {
    it('deve validar evento valido', () => {
      const evt: FlowEventData = {
        id: 'test-id',
        type: 'finish',
        timestamp: Date.now(),
        data: { promptTokens: 100, completionTokens: 50 },
      }

      const result = flowEventSchema.parse(evt)
      expect(result).toEqual(evt)
    })

    it('deve rejeitar tipo invalido', () => {
      const invalid = {
        id: 'test-id',
        type: 'invalid_type',
        timestamp: Date.now(),
        data: {},
      }

      expect(() => flowEventSchema.parse(invalid)).toThrow()
    })

    it('deve rejeitar sem id', () => {
      const invalid = {
        type: 'finish',
        timestamp: Date.now(),
        data: {},
      }

      expect(() => flowEventSchema.parse(invalid)).toThrow()
    })
  })

  describe('flowEvent + Bus', () => {
    it('deve publicar e receber eventos via Bus', () => {
      const bus = createBus()
      const handler = vi.fn()

      bus.subscribe(flowEvent, handler)

      const evt = createFlowEvent('tool_call', { name: 'read_file', args: { path: '/test' } })
      bus.publish(flowEvent, evt)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler).toHaveBeenCalledWith(evt)
    })

    it('deve publicar eventos de subagente com parentId', () => {
      const bus = createBus()
      const received: FlowEventData[] = []

      bus.subscribe(flowEvent, (evt) => received.push(evt))

      const parentEvt = createFlowEvent('subagent_start', { agentName: 'coder' })
      bus.publish(flowEvent, parentEvt)

      const childEvt = createFlowEvent('subagent_content', { text: 'code...' }, parentEvt.id)
      bus.publish(flowEvent, childEvt)

      expect(received).toHaveLength(2)
      expect(received[0]?.parentId).toBeUndefined()
      expect(received[1]?.parentId).toBe(parentEvt.id)
    })

    it('deve validar schema no publish e rejeitar dados invalidos', () => {
      const bus = createBus()

      expect(() => {
        bus.publish(flowEvent, { type: 'bad' } as unknown as FlowEventData)
      }).toThrow()
    })
  })
})
