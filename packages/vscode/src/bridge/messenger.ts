/**
 * Messenger
 * Descrição: Ponte tipada entre Extension (Node.js) e Webview (React).
 * Extension side usa vscode.Webview.postMessage + onDidReceiveMessage.
 * Webview side usa acquireVsCodeApi().postMessage + window.addEventListener('message').
 */

import type * as vscode from 'vscode'
import type { ExtensionToWebview, WebviewToExtension } from './messenger-types.js'

/**
 * ExtensionMessenger
 * Descrição: Messenger do lado da extensão. Encapsula um vscode.Webview com postMessage/onMessage tipados.
 */
export class ExtensionMessenger {
  /** handlers - Mapa de handlers registrados por tipo de mensagem */
  private handlers = new Map<string, Array<(data: WebviewToExtension) => void>>()
  /** disposable - Disposable do listener de mensagens do webview */
  private disposable: vscode.Disposable

  /**
   * constructor
   * Descrição: Cria uma instância do ExtensionMessenger e registra o listener de mensagens do webview.
   * @param webview - Instância do vscode.Webview para comunicação
   */
  constructor(private webview: vscode.Webview) {
    this.disposable = webview.onDidReceiveMessage((msg: WebviewToExtension) => {
      const handlers = this.handlers.get(msg.type)
      if (handlers) {
        for (const handler of handlers) {
          handler(msg)
        }
      }
      // Also emit to wildcard handlers
      const wildcards = this.handlers.get('*')
      if (wildcards) {
        for (const handler of wildcards) {
          handler(msg)
        }
      }
    })
  }

  /**
   * post
   * Descrição: Envia mensagem tipada para o webview.
   * @param message - Mensagem tipada ExtensionToWebview a ser enviada
   * @returns void
   */
  post(message: ExtensionToWebview): void {
    this.webview.postMessage(message)
  }

  /**
   * on
   * Descrição: Registra handler para um tipo específico de mensagem vinda do webview.
   * @param type - Tipo da mensagem a escutar
   * @param handler - Função callback chamada quando a mensagem do tipo especificado é recebida
   * @returns void
   */
  on<T extends WebviewToExtension['type']>(
    type: T,
    handler: (msg: Extract<WebviewToExtension, { type: T }>) => void,
  ): void {
    const list = this.handlers.get(type) ?? []
    list.push(handler as (data: WebviewToExtension) => void)
    this.handlers.set(type, list)
  }

  /**
   * onAny
   * Descrição: Registra handler para todas as mensagens vindas do webview (wildcard).
   * @param handler - Função callback chamada para qualquer mensagem recebida
   * @returns void
   */
  onAny(handler: (msg: WebviewToExtension) => void): void {
    const list = this.handlers.get('*') ?? []
    list.push(handler)
    this.handlers.set('*', list)
  }

  /**
   * dispose
   * Descrição: Libera recursos do messenger, removendo listeners e limpando handlers.
   * @returns void
   */
  dispose(): void {
    this.disposable.dispose()
    this.handlers.clear()
  }
}
