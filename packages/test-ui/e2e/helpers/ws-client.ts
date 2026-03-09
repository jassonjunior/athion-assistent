/**
 * WsTestClient — cliente WebSocket para testes E2E do chat app (test-ui).
 *
 * Expõe:
 *   - connect() para criar a conexão
 *   - send() para enviar mensagens
 *   - waitForMessage() para aguardar uma mensagem específica
 *   - collectUntil() para coletar até uma condição ser satisfeita
 *   - getAll() para inspecionar todas as mensagens recebidas
 *
 * Usa o módulo `ws` (WebSocket nativo do Node/Bun).
 */
import WebSocket from 'ws'

export type WsMessage = Record<string, unknown>

export class WsTestClient {
  private ws: WebSocket
  private messages: WsMessage[] = []
  private listeners: Array<(msg: WsMessage) => void> = []

  private constructor(ws: WebSocket) {
    this.ws = ws
    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsMessage
        this.messages.push(msg)
        for (const listener of [...this.listeners]) listener(msg)
      } catch {
        /* ignora mensagens não-JSON */
      }
    })
  }

  /** Conecta ao servidor WebSocket e aguarda o handshake. */
  static async connect(url: string, timeoutMs = 10000): Promise<WsTestClient> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)

      const timer = setTimeout(() => {
        ws.close()
        reject(new Error(`WebSocket connect timeout (${timeoutMs}ms): ${url}`))
      }, timeoutMs)

      ws.once('open', () => {
        clearTimeout(timer)
        resolve(new WsTestClient(ws))
      })

      ws.once('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
    })
  }

  /** Envia uma mensagem JSON para o servidor. */
  send(msg: WsMessage): void {
    this.ws.send(JSON.stringify(msg))
  }

  /**
   * Aguarda a primeira mensagem que satisfaz o predicate.
   * Se já chegou, retorna imediatamente.
   */
  async waitForMessage(
    predicate: (msg: WsMessage) => boolean,
    timeoutMs = 10000,
  ): Promise<WsMessage> {
    const existing = this.messages.find(predicate)
    if (existing) return existing

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.listeners.indexOf(handler)
        if (idx !== -1) this.listeners.splice(idx, 1)
        reject(new Error(`waitForMessage timeout (${timeoutMs}ms)`))
      }, timeoutMs)

      const handler = (msg: WsMessage) => {
        if (predicate(msg)) {
          clearTimeout(timer)
          const idx = this.listeners.indexOf(handler)
          if (idx !== -1) this.listeners.splice(idx, 1)
          resolve(msg)
        }
      }

      this.listeners.push(handler)
    })
  }

  /**
   * Coleta mensagens até que stopPredicate retorne true.
   * Retorna todas as mensagens coletadas (incluindo a que parou).
   */
  async collectUntil(
    stopPredicate: (msg: WsMessage) => boolean,
    timeoutMs = 60000,
  ): Promise<WsMessage[]> {
    const collected: WsMessage[] = []

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.listeners.indexOf(handler)
        if (idx !== -1) this.listeners.splice(idx, 1)
        reject(new Error(`collectUntil timeout (${timeoutMs}ms)`))
      }, timeoutMs)

      const handler = (msg: WsMessage) => {
        collected.push(msg)
        if (stopPredicate(msg)) {
          clearTimeout(timer)
          const idx = this.listeners.indexOf(handler)
          if (idx !== -1) this.listeners.splice(idx, 1)
          resolve(collected)
        }
      }

      this.listeners.push(handler)
    })
  }

  /** Retorna cópia de todas as mensagens recebidas até agora. */
  getAll(): WsMessage[] {
    return [...this.messages]
  }

  /** Fecha a conexão WebSocket. */
  close(): void {
    this.ws.close()
  }
}
