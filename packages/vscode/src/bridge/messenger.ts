/**
 * Messenger — Ponte tipada entre Extension e Webview.
 *
 * Extension side: usa vscode.Webview.postMessage + onDidReceiveMessage
 * Webview side: usa acquireVsCodeApi().postMessage + window.addEventListener('message')
 */

import type * as vscode from 'vscode'
import type { ExtensionToWebview, WebviewToExtension } from './messenger-types.js'

/**
 * Extension-side messenger.
 * Wraps a vscode.Webview with typed postMessage/onMessage.
 */
export class ExtensionMessenger {
  private handlers = new Map<string, Array<(data: WebviewToExtension) => void>>()
  private disposable: vscode.Disposable

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

  /** Send typed message to webview */
  post(message: ExtensionToWebview): void {
    this.webview.postMessage(message)
  }

  /** Listen for specific message type from webview */
  on<T extends WebviewToExtension['type']>(
    type: T,
    handler: (msg: Extract<WebviewToExtension, { type: T }>) => void,
  ): void {
    const list = this.handlers.get(type) ?? []
    list.push(handler as (data: WebviewToExtension) => void)
    this.handlers.set(type, list)
  }

  /** Listen for all messages from webview */
  onAny(handler: (msg: WebviewToExtension) => void): void {
    const list = this.handlers.get('*') ?? []
    list.push(handler)
    this.handlers.set('*', list)
  }

  dispose(): void {
    this.disposable.dispose()
    this.handlers.clear()
  }
}
