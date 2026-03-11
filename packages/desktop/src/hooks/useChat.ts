/**
 * useChat — Gerencia estado do chat no desktop app.
 *
 * Usa Tauri Bridge (invoke/listen) em vez de Messenger (postMessage).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import * as bridge from '../bridge/tauri-bridge.js'
import type { SkillSearchResult } from '../bridge/tauri-bridge.js'
import { createChatEventHandler, flushAssistant, type ChatRefs } from './chat-events.js'
import type { SidecarStatus } from '../bridge/types.js'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolCalls?: ToolCallInfo[] | undefined
}

export interface ToolCallInfo {
  id: string
  name: string
  args: unknown
  status: 'running' | 'success' | 'error'
  result?: string | undefined
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [status, setStatus] = useState<SidecarStatus>('starting')
  const [activeSkill, setActiveSkill] = useState<string | null>(null)
  const refs: ChatRefs = {
    content: useRef(''),
    toolCalls: useRef<ToolCallInfo[]>([]),
    messageId: useRef(0),
  }

  // Listen for chat events from sidecar
  useEffect(() => {
    const handler = createChatEventHandler(refs, setMessages, setIsStreaming)
    const unlisten = bridge.onChatEvent(handler)

    // Check sidecar status and create initial session
    initSession()

    return () => {
      unlisten.then((fn) => fn())
    }
  }, [])

  const initSession = useCallback(async () => {
    // Retry ping up to 10 times (sidecar may still be bootstrapping)
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await bridge.ping()
        const session = await bridge.sessionCreate('default')
        setSessionId(session.id)
        setStatus('ready')
        return
      } catch {
        if (attempt < 9) {
          await new Promise((r) => setTimeout(r, 1000))
        }
      }
    }
    setStatus('error')
  }, [])

  function addSystemMsg(content: string) {
    setMessages((prev) => [
      ...prev,
      { id: `sys-${Date.now()}`, role: 'assistant' as const, content },
    ])
  }

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming || !sessionId) return

      // /use-skill <nome>
      const useSkillMatch = content.trim().match(/^\/use-skill\s+(\S+)$/)
      if (useSkillMatch) {
        const name = useSkillMatch[1] ?? ''
        setMessages((prev) => [
          ...prev,
          { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
        ])
        try {
          await bridge.skillSetActive(name)
          setActiveSkill(name)
          addSystemMsg(
            `Skill \`${name}\` ativada! ● As instruções desta skill serão aplicadas nas próximas mensagens. Use \`/clear-skill\` para desativar.`,
          )
        } catch (err) {
          addSystemMsg(`Erro ao ativar skill: ${err instanceof Error ? err.message : String(err)}`)
        }
        return
      }

      // /clear-skill
      if (content.trim() === '/clear-skill') {
        setMessages((prev) => [
          ...prev,
          { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
        ])
        try {
          await bridge.skillClearActive()
          setActiveSkill(null)
          addSystemMsg('Skill desativada. Voltando ao modo automático.')
        } catch {
          /* silencioso */
        }
        return
      }

      // /find-skills [query]
      const findSkillsMatch = content.trim().match(/^\/find-skills\s*(.*)$/)
      if (findSkillsMatch) {
        const query = (findSkillsMatch[1] ?? '').trim()
        setMessages((prev) => [
          ...prev,
          { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
        ])
        addSystemMsg('Buscando skills disponíveis...')
        try {
          const { results } = await bridge.pluginSearch(query || undefined)
          if (results.length === 0) {
            addSystemMsg(
              query
                ? `Nenhuma skill encontrada para "${query}".`
                : 'Nenhuma skill disponível no registry ainda.',
            )
          } else {
            const list = (results as SkillSearchResult[])
              .map(
                (r) =>
                  `- **${r.pluginName}** \`v${r.version}\`${r.author ? ` — ${r.author}` : ''}\n  ${r.description}`,
              )
              .join('\n')
            addSystemMsg(
              `**Skills disponíveis${query ? ` para "${query}"` : ''}:**\n\n${list}\n\n` +
                `Para instalar: \`/install-skill <nome>\``,
            )
          }
        } catch (err) {
          addSystemMsg(`Erro ao buscar skills: ${err instanceof Error ? err.message : String(err)}`)
        }
        return
      }

      // /install-skill <nome>
      const installMatch = content.trim().match(/^\/install-skill\s+(\S+)$/)
      if (installMatch) {
        const name = installMatch[1] ?? ''
        setMessages((prev) => [
          ...prev,
          { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
        ])
        addSystemMsg(`Instalando skill \`${name}\`...`)
        try {
          const result = await bridge.pluginInstall(name)
          addSystemMsg(
            result.success
              ? `Skill \`${name}\` instalada com sucesso! Use \`/skills\` para ver.`
              : `Erro ao instalar skill \`${name}\`: ${result.error ?? 'desconhecido'}`,
          )
        } catch (err) {
          addSystemMsg(`Erro: ${err instanceof Error ? err.message : String(err)}`)
        }
        return
      }

      setMessages((prev) => [
        ...prev,
        { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
      ])
      refs.content.current = ''
      refs.toolCalls.current = []
      setIsStreaming(true)
      try {
        await bridge.chatSend(sessionId, content)
      } catch {
        flushAssistant(refs, setMessages)
        setIsStreaming(false)
      }
    },
    [isStreaming, sessionId, refs],
  )

  const abort = useCallback(async () => {
    if (sessionId) await bridge.chatAbort(sessionId)
    setIsStreaming(false)
  }, [sessionId])

  const newSession = useCallback(async () => {
    setMessages([])
    refs.content.current = ''
    refs.toolCalls.current = []
    try {
      const session = await bridge.sessionCreate('default')
      setSessionId(session.id)
    } catch {
      // ignore
    }
  }, [refs])

  return { messages, isStreaming, sessionId, status, activeSkill, sendMessage, abort, newSession }
}
