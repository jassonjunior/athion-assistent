/**
 * useMessenger — Hook para comunicação Webview ↔ Extension.
 *
 * Usa acquireVsCodeApi().postMessage para enviar,
 * e window.addEventListener('message') para receber.
 */

import { useCallback, useEffect, useRef } from 'react'

// VS Code API type — injected by the webview runtime
interface VsCodeApi {
  postMessage(message: unknown): void
  getState(): unknown
  setState(state: unknown): void
}

declare function acquireVsCodeApi(): VsCodeApi

// Singleton — acquireVsCodeApi can only be called once
let vscodeApi: VsCodeApi | null = null

function getVsCodeApi(): VsCodeApi {
  if (!vscodeApi) {
    vscodeApi = acquireVsCodeApi()
  }
  return vscodeApi
}

type MessageHandler = (data: unknown) => void

export function useMessenger() {
  const handlersRef = useRef<Map<string, MessageHandler[]>>(new Map())

  /** Send message to extension */
  const post = useCallback((message: { type: string; [key: string]: unknown }) => {
    getVsCodeApi().postMessage(message)
  }, [])

  /** Register handler for a specific message type */
  const on = useCallback((type: string, handler: MessageHandler) => {
    const list = handlersRef.current.get(type) ?? []
    list.push(handler)
    handlersRef.current.set(type, list)
  }, [])

  /** Remove handler */
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
