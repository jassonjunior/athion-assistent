import { describe, expect, it, afterEach } from 'vitest'
import { createBus } from '../bus/bus'
import { flowEvent, createFlowEvent } from '../orchestrator/flow-events'
import { createFlowServer } from './flow-ws'
import type { FlowServer } from './flow-ws'

/** getRandomPort
 * Descricao: Retorna porta aleatoria para evitar conflitos entre testes.
 */
function getRandomPort(): number {
  return 10000 + Math.floor(Math.random() * 50000)
}

describe('flow-ws', () => {
  const servers: FlowServer[] = []

  afterEach(() => {
    for (const s of servers) s.stop()
    servers.length = 0
  })

  it('deve iniciar o servidor na porta configurada', () => {
    const bus = createBus()
    const port = getRandomPort()
    const server = createFlowServer(bus, port)
    servers.push(server)

    expect(server.port).toBe(port)
    expect(server.clientCount()).toBe(0)
  })

  it('deve aceitar conexao WebSocket e incrementar clientCount', async () => {
    const bus = createBus()
    const port = getRandomPort()
    const server = createFlowServer(bus, port)
    servers.push(server)

    const ws = new WebSocket(`ws://localhost:${port}`)
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve()
    })

    // Pequeno delay para o server processar o open
    await new Promise((r) => setTimeout(r, 50))
    expect(server.clientCount()).toBe(1)

    ws.close()
    await new Promise((r) => setTimeout(r, 50))
    expect(server.clientCount()).toBe(0)
  })

  it('deve retransmitir flowEvent para clientes conectados', async () => {
    const bus = createBus()
    const port = getRandomPort()
    const server = createFlowServer(bus, port)
    servers.push(server)

    const ws = new WebSocket(`ws://localhost:${port}`)
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve()
    })

    const received: unknown[] = []
    ws.onmessage = (e) => received.push(JSON.parse(e.data as string))

    const evt = createFlowEvent('user_message', { content: 'hello' })
    bus.publish(flowEvent, evt)

    await new Promise((r) => setTimeout(r, 100))

    expect(received).toHaveLength(1)
    expect(received[0]).toEqual(
      expect.objectContaining({ type: 'user_message', data: { content: 'hello' } }),
    )

    ws.close()
  })

  it('deve retransmitir para multiplos clientes simultaneamente', async () => {
    const bus = createBus()
    const port = getRandomPort()
    const server = createFlowServer(bus, port)
    servers.push(server)

    const ws1 = new WebSocket(`ws://localhost:${port}`)
    const ws2 = new WebSocket(`ws://localhost:${port}`)
    await Promise.all([
      new Promise<void>((resolve) => {
        ws1.onopen = () => resolve()
      }),
      new Promise<void>((resolve) => {
        ws2.onopen = () => resolve()
      }),
    ])

    const received1: unknown[] = []
    const received2: unknown[] = []
    ws1.onmessage = (e) => received1.push(JSON.parse(e.data as string))
    ws2.onmessage = (e) => received2.push(JSON.parse(e.data as string))

    await new Promise((r) => setTimeout(r, 50))
    expect(server.clientCount()).toBe(2)

    bus.publish(flowEvent, createFlowEvent('finish', { tokens: 100 }))

    await new Promise((r) => setTimeout(r, 100))

    expect(received1).toHaveLength(1)
    expect(received2).toHaveLength(1)
    expect(received1[0]).toEqual(received2[0])

    ws1.close()
    ws2.close()
  })

  it('deve parar de retransmitir apos stop()', async () => {
    const bus = createBus()
    const port = getRandomPort()
    const server = createFlowServer(bus, port)
    servers.push(server)

    const ws = new WebSocket(`ws://localhost:${port}`)
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve()
    })

    const received: unknown[] = []
    ws.onmessage = (e) => received.push(JSON.parse(e.data as string))

    server.stop()

    // Publicar apos stop — cliente nao deve receber
    bus.publish(flowEvent, createFlowEvent('error', { message: 'test' }))
    await new Promise((r) => setTimeout(r, 100))

    expect(received).toHaveLength(0)

    ws.close()
  })

  it('deve responder HTTP na rota raiz', async () => {
    const bus = createBus()
    const port = getRandomPort()
    const server = createFlowServer(bus, port)
    servers.push(server)

    const res = await fetch(`http://localhost:${port}`)
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('Flow Observer')
  })
})
