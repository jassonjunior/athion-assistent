/**
 * useChat
 * Descrição: Hook que gerencia o estado completo do chat no desktop app.
 * Usa Tauri Bridge (invoke/listen) em vez de Messenger (postMessage) para comunicação com o sidecar.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import * as bridge from '../bridge/tauri-bridge.js'
import type { SkillSearchResult } from '../bridge/tauri-bridge.js'
import { createChatEventHandler, flushAssistant, type ChatRefs } from './chat-events.js'
import type { SidecarStatus } from '../bridge/types.js'

/** ChatMessage
 * Descrição: Representa uma mensagem individual no chat (do usuário ou do assistente)
 */
export interface ChatMessage {
  /** Identificador único da mensagem */
  id: string
  /** Papel do remetente da mensagem */
  role: 'user' | 'assistant'
  /** Conteúdo textual da mensagem */
  content: string
  /** Lista opcional de chamadas de ferramentas associadas à mensagem */
  toolCalls?: ToolCallInfo[] | undefined
}

/** ToolCallInfo
 * Descrição: Informações sobre uma chamada de ferramenta (tool call) feita pelo assistente
 */
export interface ToolCallInfo {
  /** Identificador único da chamada de ferramenta */
  id: string
  /** Nome da ferramenta invocada */
  name: string
  /** Argumentos passados para a ferramenta */
  args: unknown
  /** Estado atual da execução da ferramenta */
  status: 'running' | 'success' | 'error'
  /** Preview textual do resultado da ferramenta */
  result?: string | undefined
}

/** useChat
 * Descrição: Hook React que gerencia mensagens, streaming, sessões e comandos especiais (/use-skill, /find-skills, /install-skill, /clear-skill)
 * @returns Objeto com estado do chat (messages, isStreaming, sessionId, status, activeSkill) e ações (sendMessage, abort, newSession)
 */
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

  /** initSession
   * Descrição: Inicializa a sessão de chat, tentando conectar ao sidecar com até 10 tentativas
   */
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

  /** addSystemMsg
   * Descrição: Adiciona uma mensagem do sistema (exibida como assistente) ao chat
   * @param content - Conteúdo textual da mensagem do sistema
   */
  function addSystemMsg(content: string) {
    setMessages((prev) => [
      ...prev,
      { id: `sys-${Date.now()}`, role: 'assistant' as const, content },
    ])
  }

  /** sendMessage
   * Descrição: Envia uma mensagem do usuário, processando comandos especiais (/use-skill, /clear-skill, /find-skills, /install-skill) ou enviando ao sidecar via bridge
   * @param content - Conteúdo da mensagem a ser enviada
   */
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

  /** abort
   * Descrição: Aborta a geração de resposta em andamento para a sessão atual
   */
  const abort = useCallback(async () => {
    if (sessionId) await bridge.chatAbort(sessionId)
    setIsStreaming(false)
  }, [sessionId])

  /** newSession
   * Descrição: Cria uma nova sessão de chat, limpando mensagens e estado acumulado
   */
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
