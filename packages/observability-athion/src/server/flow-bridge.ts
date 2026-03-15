/**
 * Flow Bridge — Conecta o sidecar do Observability ao FlowServer do CLI.
 *
 * Descobre instâncias ativas do FlowServer (via ~/.athion/flow-port-*.json),
 * conecta como cliente WebSocket e retransmite os FlowEventMessage para
 * todos os clientes do Observability.
 */

/* eslint-disable no-console */

import { listFlowPorts } from '@athion/core'

/** Intervalo de polling para descobrir novas instâncias (ms) */
const DISCOVERY_INTERVAL = 3_000

type BroadcastFn = (data: string) => void

interface ConnectedInstance {
  pid: number
  port: number
  ws: WebSocket
}

/**
 * Inicia a ponte entre FlowServers do CLI e o sidecar do Observability.
 * Descobre instâncias ativas, conecta e retransmite eventos.
 *
 * @param broadcastRaw - Função que envia string JSON para todos os clientes do sidecar
 * @returns cleanup function para parar o bridge
 */
export function startFlowBridge(broadcastRaw: BroadcastFn): () => void {
  const connections = new Map<number, ConnectedInstance>()
  let stopped = false

  function connectToInstance(pid: number, port: number): void {
    if (stopped || connections.has(pid)) return

    const url = `ws://localhost:${port}`
    console.log(`[flow-bridge] Connecting to FlowServer pid=${pid} port=${port}`)

    try {
      const ws = new WebSocket(url)

      ws.onopen = () => {
        console.log(`[flow-bridge] Connected to FlowServer pid=${pid} port=${port}`)
      }

      ws.onmessage = (event) => {
        // Retransmite o evento raw (já é JSON) para todos os clientes do sidecar
        const raw = typeof event.data === 'string' ? event.data : String(event.data)
        broadcastRaw(raw)
      }

      ws.onclose = () => {
        console.log(`[flow-bridge] Disconnected from FlowServer pid=${pid}`)
        connections.delete(pid)
      }

      ws.onerror = () => {
        // onclose será chamado após onerror
      }

      connections.set(pid, { pid, port, ws })
    } catch (err) {
      console.error(`[flow-bridge] Failed to connect to pid=${pid}:`, err)
    }
  }

  function discover(): void {
    if (stopped) return

    try {
      const activePorts = listFlowPorts()
      const activePids = new Set(activePorts.map((p) => p.pid))

      // Conectar a novas instâncias
      for (const info of activePorts) {
        if (!connections.has(info.pid)) {
          connectToInstance(info.pid, info.port)
        }
      }

      // Limpar conexões de instâncias que morreram
      for (const [pid, conn] of connections) {
        if (!activePids.has(pid)) {
          console.log(`[flow-bridge] FlowServer pid=${pid} no longer active, closing`)
          conn.ws.close()
          connections.delete(pid)
        }
      }
    } catch (err) {
      console.error('[flow-bridge] Discovery error:', err)
    }
  }

  // Descoberta inicial
  discover()

  // Polling periódico
  const timer = setInterval(discover, DISCOVERY_INTERVAL)

  // Cleanup
  return () => {
    stopped = true
    clearInterval(timer)
    for (const [, conn] of connections) {
      conn.ws.close()
    }
    connections.clear()
    console.log('[flow-bridge] Stopped')
  }
}
