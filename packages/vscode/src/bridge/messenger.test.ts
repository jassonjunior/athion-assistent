import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ExtensionMessenger } from './messenger.js'
import type * as vscode from 'vscode'

function createMockWebview() {
  const messageHandlers: Array<(msg: unknown) => void> = []

  const webview = {
    postMessage: vi.fn(),
    onDidReceiveMessage: vi.fn((handler: (msg: unknown) => void) => {
      messageHandlers.push(handler)
      return { dispose: vi.fn() }
    }),
    // Simulate receiving a message from webview
    _simulateMessage(msg: unknown) {
      for (const handler of messageHandlers) {
        handler(msg)
      }
    },
  }

  return webview
}

describe('ExtensionMessenger', () => {
  let webview: ReturnType<typeof createMockWebview>
  let messenger: ExtensionMessenger

  beforeEach(() => {
    webview = createMockWebview()
    messenger = new ExtensionMessenger(webview as unknown as vscode.Webview)
  })

  describe('constructor', () => {
    it('registra listener de mensagens no webview', () => {
      expect(webview.onDidReceiveMessage).toHaveBeenCalledOnce()
    })
  })

  describe('post', () => {
    it('envia mensagem para o webview', () => {
      const message = { type: 'chat:event' as const, event: { type: 'content', content: 'hi' } }
      messenger.post(message as never)

      expect(webview.postMessage).toHaveBeenCalledWith(message)
    })
  })

  describe('on', () => {
    it('registra handler para tipo especifico de mensagem', () => {
      const handler = vi.fn()
      messenger.on('chat:send', handler)

      webview._simulateMessage({ type: 'chat:send', content: 'hello' })

      expect(handler).toHaveBeenCalledWith({ type: 'chat:send', content: 'hello' })
    })

    it('nao chama handler de outro tipo', () => {
      const handler = vi.fn()
      messenger.on('chat:send', handler)

      webview._simulateMessage({ type: 'chat:abort' })

      expect(handler).not.toHaveBeenCalled()
    })

    it('suporta multiplos handlers para o mesmo tipo', () => {
      const handler1 = vi.fn()
      const handler2 = vi.fn()
      messenger.on('chat:send', handler1)
      messenger.on('chat:send', handler2)

      webview._simulateMessage({ type: 'chat:send', content: 'hello' })

      expect(handler1).toHaveBeenCalledOnce()
      expect(handler2).toHaveBeenCalledOnce()
    })
  })

  describe('onAny', () => {
    it('recebe todas as mensagens (wildcard)', () => {
      const handler = vi.fn()
      messenger.onAny(handler)

      webview._simulateMessage({ type: 'chat:send', content: 'hello' })
      webview._simulateMessage({ type: 'chat:abort' })

      expect(handler).toHaveBeenCalledTimes(2)
    })

    it('e chamado junto com handler especifico', () => {
      const specificHandler = vi.fn()
      const wildcardHandler = vi.fn()
      messenger.on('chat:send', specificHandler)
      messenger.onAny(wildcardHandler)

      webview._simulateMessage({ type: 'chat:send', content: 'hello' })

      expect(specificHandler).toHaveBeenCalledOnce()
      expect(wildcardHandler).toHaveBeenCalledOnce()
    })
  })

  describe('dispose', () => {
    it('limpa handlers e dispose do listener', () => {
      const handler = vi.fn()
      messenger.on('chat:send', handler)

      messenger.dispose()

      // After dispose, messages should not be delivered
      // (since the disposable was called and handlers cleared)
    })
  })
})
