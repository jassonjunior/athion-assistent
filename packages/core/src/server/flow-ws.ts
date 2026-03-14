/** flow-ws
 * Descricao: Servidor WebSocket leve que escuta flowEvent no Bus e retransmite
 * para clientes conectados. Permite observar o fluxo de execucao em tempo real
 * via Flow Observer (test-ui em modo live, wscat, etc).
 */

import type { Server, ServerWebSocket } from 'bun'
import type { Bus } from '../bus/bus'
import { flowEvent } from '../orchestrator/flow-events'
import { createLogger } from '../logger'

const log = createLogger('flow-ws')

/** FlowServer
 * Descricao: Interface do servidor WebSocket do Flow Observer.
 */
export interface FlowServer {
  /** port — Porta em que o servidor esta escutando */
  port: number
  /** clientCount — Numero de clientes conectados */
  clientCount(): number
  /** stop — Para o servidor WebSocket */
  stop(): void
}

/** createFlowServer
 * Descricao: Cria e inicia um servidor WebSocket que retransmite flowEvents do Bus
 * para todos os clientes conectados.
 * @param bus - Bus de eventos para escutar flowEvent
 * @param port - Porta para o servidor WebSocket
 * @returns FlowServer com controle do servidor
 */
export function createFlowServer(bus: Bus, port: number): FlowServer {
  const clients = new Set<ServerWebSocket<unknown>>()

  const unsubscribe = bus.subscribe(flowEvent, (data) => {
    const msg = JSON.stringify(data)
    for (const ws of clients) {
      try {
        ws.send(msg)
      } catch {
        clients.delete(ws)
      }
    }
  })

  const server: Server = Bun.serve({
    port,
    fetch(req, server) {
      if (server.upgrade(req)) return undefined
      return new Response('Athion Flow Observer WebSocket', { status: 200 })
    },
    websocket: {
      open(ws) {
        clients.add(ws)
        log.info({ clientCount: clients.size }, 'flow-ws client connected')
      },
      close(ws) {
        clients.delete(ws)
        log.info({ clientCount: clients.size }, 'flow-ws client disconnected')
      },
      message() {
        /* client→server nao precisa de tratamento por enquanto */
      },
    },
  })

  log.info({ port: server.port }, 'Flow Observer WebSocket server started')

  return {
    port: server.port,
    clientCount: () => clients.size,
    stop: () => {
      unsubscribe()
      server.stop()
      clients.clear()
      log.info('Flow Observer WebSocket server stopped')
    },
  }
}
