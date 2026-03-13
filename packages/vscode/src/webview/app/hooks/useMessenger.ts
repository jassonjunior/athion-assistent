/**
 * useMessenger
 * Descrição: Hook React para comunicação bidirecional Webview <-> Extension.
 * Usa acquireVsCodeApi().postMessage para enviar e window.addEventListener('message') para receber.
 */

import { useCallback, useEffect, useRef } from 'react'

/**
 * VsCodeApi
 * Descrição: Interface da API do VS Code injetada pelo runtime do webview.
 */
interface VsCodeApi {
  /** Envia mensagem para a extensão */
  postMessage(message: unknown): void
  /** Obtém o estado persistido do webview */
  getState(): unknown
  /** Define o estado persistido do webview */
  setState(state: unknown): void
}

declare function acquireVsCodeApi(): VsCodeApi

/** vscodeApi - Singleton da API do VS Code (acquireVsCodeApi só pode ser chamado uma vez) */
let vscodeApi: VsCodeApi | null = null

/**
 * getVsCodeApi
 * Descrição: Obtém a instância singleton da API do VS Code.
 * @returns Instância da VsCodeApi
 */
function getVsCodeApi(): VsCodeApi {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi()
  }
  return vscodeApi
}

/**
 * MessageHandler
 * Descrição: Tipo de função handler para mensagens recebidas da extensão.
 */
type MessageHandler = (data: unknown) => void

/**
 * useMessenger
 * Descrição: Hook que fornece métodos post, on e off para comunicação tipada entre webview e extensão.
 * @returns Objeto com métodos post (enviar), on (registrar handler) e off (remover handler)
 */
export function useMessenger() {
  const handlersRef = useRef<Map<string, MessageHandler[]>>(new Map())

  /**
   * post
   * Descrição: Envia mensagem tipada para a extensão via VS Code API.
   * @param message - Objeto com type e dados a enviar
   * @returns void
   */
  const post = useCallback((message: { type: string; [key: string]: unknown }) => {
    getVsCodeApi().postMessage(message)
  }, [])

  /**
   * on
   * Descrição: Registra handler para um tipo específico de mensagem vinda da extensão.
   * @param type - Tipo da mensagem a escutar
   * @param handler - Função callback chamada com os dados da mensagem
   * @returns void
   */
  const on = useCallback((type: string, handler: MessageHandler) => {
    const list = handlersRef.current.get(type) ?? []
    list.push(handler)
    handlersRef.current.set(type, list)
  }, [])

  /**
   * off
   * Descrição: Remove um handler previamente registrado para um tipo de mensagem.
   * @param type - Tipo da mensagem
   * @param handler - Referência do handler a remover
   * @returns void
   */
  const off = useCallback((type: string, handler: MessageHandler) => {
    const list = handlersRef.current.get(type) ?? []
    handlersRef.current.set(
      type,
      list.filter((h) => h !== handler),
    )
  }, [])

  // Listen for messages from extension
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = event.data as { type: string }
      if (!data?.type) return

      const handlers = handlersRef.current.get(data.type)
      if (handlers) {
        for (const handler of handlers) {
          handler(data)
        }
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return { post, on, off }
}
