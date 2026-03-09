import { z } from 'zod'
import { describe, expect, it, vi } from 'vitest'
import { createBus, defineBusEvent } from './bus'

const MessageEvent = defineBusEvent('test.message', z.object({ text: z.string() }))
const CountEvent = defineBusEvent('test.count', z.object({ value: z.number() }))

describe('createBus', () => {
  it('cria uma instância com publish, subscribe, once, clear', () => {
    const bus = createBus()
    expect(typeof bus.publish).toBe('function')
    expect(typeof bus.subscribe).toBe('function')
    expect(typeof bus.once).toBe('function')
    expect(typeof bus.clear).toBe('function')
  })

  it('publish notifica subscriber com dados corretos', () => {
    const bus = createBus()
    const handler = vi.fn()
    bus.subscribe(MessageEvent, handler)
    bus.publish(MessageEvent, { text: 'hello' })
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ text: 'hello' })
  })

  it('múltiplos subscribers recebem o evento', () => {
    const bus = createBus()
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.subscribe(MessageEvent, h1)
    bus.subscribe(MessageEvent, h2)
    bus.publish(MessageEvent, { text: 'world' })
    expect(h1).toHaveBeenCalledOnce()
    expect(h2).toHaveBeenCalledOnce()
  })

  it('unsubscribe remove o handler', () => {
    const bus = createBus()
    const handler = vi.fn()
    const unsub = bus.subscribe(MessageEvent, handler)
    unsub()
    bus.publish(MessageEvent, { text: 'after unsub' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('once dispara apenas na primeira publicação', () => {
    const bus = createBus()
    const handler = vi.fn()
    bus.once(MessageEvent, handler)
    bus.publish(MessageEvent, { text: 'first' })
    bus.publish(MessageEvent, { text: 'second' })
    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ text: 'first' })
  })

  it('once pode ser cancelado antes de disparar', () => {
    const bus = createBus()
    const handler = vi.fn()
    const cancel = bus.once(MessageEvent, handler)
    cancel()
    bus.publish(MessageEvent, { text: 'cancelled' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('clear remove todos os subscribers', () => {
    const bus = createBus()
    const h1 = vi.fn()
    const h2 = vi.fn()
    bus.subscribe(MessageEvent, h1)
    bus.subscribe(CountEvent, h2)
    bus.clear()
    bus.publish(MessageEvent, { text: 'after clear' })
    bus.publish(CountEvent, { value: 42 })
    expect(h1).not.toHaveBeenCalled()
    expect(h2).not.toHaveBeenCalled()
  })

  it('publish valida dados com schema Zod e rejeita payload inválido', () => {
    const bus = createBus()
    bus.subscribe(CountEvent, vi.fn())
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bus.publish(CountEvent, { value: 'not-a-number' } as any),
    ).toThrow()
  })

  it('publish sem subscribers não lança erro', () => {
    const bus = createBus()
    expect(() => bus.publish(MessageEvent, { text: 'noop' })).not.toThrow()
  })

  it('eventos diferentes não interferem entre si', () => {
    const bus = createBus()
    const msgHandler = vi.fn()
    const countHandler = vi.fn()
    bus.subscribe(MessageEvent, msgHandler)
    bus.subscribe(CountEvent, countHandler)
    bus.publish(MessageEvent, { text: 'hi' })
    expect(msgHandler).toHaveBeenCalledOnce()
    expect(countHandler).not.toHaveBeenCalled()
  })
})

describe('defineBusEvent', () => {
  it('retorna objeto com type e schema', () => {
    const ev = defineBusEvent('my.event', z.object({ id: z.string() }))
    expect(ev.type).toBe('my.event')
    expect(ev.schema).toBeDefined()
  })
})
