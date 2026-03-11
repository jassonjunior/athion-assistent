/**
 * useChat — Gerencia estado do chat no webview.
 *
 * Recebe eventos via Messenger (em vez de AsyncGenerator como no CLI).
 * Acumula conteúdo streaming, rastreia tool calls e subagents.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMessenger } from './useMessenger.js'
import { createChatEventHandler, flushAssistant, type ChatRefs } from './chat-events.js'

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

export interface SessionInfo {
  id: string
  title: string
}

interface SkillInfo {
  name: string
  description: string
  triggers: string[]
}

type CoreStatus = 'starting' | 'ready' | 'error' | 'stopped'

const HELP_TEXT = `**Comandos disponíveis:**

**Chat:**
- \`/clear\` — Limpar mensagens
- \`/help\` — Mostrar esta ajuda

**Agentes & Skills:**
- \`/agents\` — Listar agentes disponíveis
- \`/skills\` — Listar skills instaladas
- \`/use-skill <nome>\` — Ativar skill explicitamente
- \`/clear-skill\` — Desativar skill ativa
- \`/find-skills [query]\` — Buscar skills no registry
- \`/install-skill <nome>\` — Instalar skill do registry

**Modelo:**
- \`/model\` — Mostrar modelo e provider atuais

**Codebase:**
- \`/codebase-index\` — Indexar o workspace
- \`/codebase-search <query>\` — Buscar semanticamente no código
- \`/codebase [query]\` — Alias (sem arg = indexar, com arg = buscar)

**@Mentions:**
- \`@arquivo.ts\` — Injeta o conteúdo do arquivo no prompt (max 200 linhas)`

export function useChat() {
  const { post, on } = useMessenger()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [status, setStatus] = useState<CoreStatus>('starting')
  const [activeSkill, setActiveSkill] = useState<string | null>(null)
  const refs: ChatRefs = {
    content: useRef(''),
    toolCalls: useRef<ToolCallInfo[]>([]),
    messageId: useRef(0),
  }

  // Flags para distinguir quando skill:list:result e config:result foram disparados por slash commands
  const pendingSkillsListRef = useRef(false)
  const pendingModelRef = useRef(false)

  useEffect(() => {
    const handleEvent = createChatEventHandler(refs, setMessages, setIsStreaming)

    on('status:update', (d: unknown) => setStatus((d as { status: CoreStatus }).status))
    on('session:active', (d: unknown) => {
      const s = (d as { session: { id: string; title: string } }).session
      setSession({ id: s.id, title: s.title })
    })
    on('chat:event', (d: unknown) => handleEvent((d as { event: { type: string } }).event))
    on('chat:complete', () => {
      flushAssistant(refs, setMessages)
      setIsStreaming(false)
    })

    // Codebase slash command responses
    on('codebase:result', (d: unknown) => {
      const data = d as {
        results: Array<{ file: string; startLine: number; symbolName?: string; score: number }>
        query: string
      }
      const lines = data.results.map(
        (r, i) =>
          `${i + 1}. \`${r.file}:${r.startLine}\`${r.symbolName ? ` — **${r.symbolName}**` : ''} [${Math.round(r.score * 100)}%]`,
      )
      const md =
        data.results.length > 0
          ? `**Resultados para "${data.query}":**\n\n${lines.join('\n')}`
          : `Nenhum resultado para "${data.query}". Execute *Athion: Index Codebase* primeiro.`
      setMessages((prev) => [
        ...prev,
        { id: `codebase-${Date.now()}`, role: 'assistant' as const, content: md },
      ])
    })
    on('codebase:indexed', (d: unknown) => {
      const data = d as { totalFiles: number; totalChunks: number }
      setMessages((prev) => [
        ...prev,
        {
          id: `codebase-idx-${Date.now()}`,
          role: 'assistant' as const,
          content: `Codebase indexado: ${data.totalFiles} arquivos, ${data.totalChunks} chunks.`,
        },
      ])
    })
    on('codebase:error', (d: unknown) => {
      const data = d as { message: string }
      setMessages((prev) => [
        ...prev,
        {
          id: `codebase-err-${Date.now()}`,
          role: 'assistant' as const,
          content: `Erro no codebase: ${data.message}`,
        },
      ])
    })

    on('skills:found', (d: unknown) => {
      const data = d as {
        results: Array<{
          pluginName: string
          description: string
          version: string
          author?: string
        }>
        query?: string
      }
      let content: string
      if (data.results.length === 0) {
        content = data.query
          ? `Nenhuma skill encontrada para "${data.query}".`
          : 'Nenhuma skill disponível no registry ainda.'
      } else {
        const list = data.results
          .map(
            (r) =>
              `- **${r.pluginName}** \`v${r.version}\`${r.author ? ` — ${r.author}` : ''}\n  ${r.description}`,
          )
          .join('\n')
        content =
          `**Skills disponíveis${data.query ? ` para "${data.query}"` : ''}:**\n\n${list}\n\n` +
          `Para instalar: \`/install-skill <nome>\``
      }
      setMessages((prev) => [
        ...prev,
        { id: `skills-found-${Date.now()}`, role: 'assistant' as const, content },
      ])
    })

    on('skill:active', (d: unknown) => {
      const data = d as { name: string | null }
      setActiveSkill(data.name)
    })

    on('skills:installed', (d: unknown) => {
      const data = d as { name: string; success: boolean; error?: string }
      const content = data.success
        ? `Skill \`${data.name}\` instalada com sucesso! Use \`/skills\` para ver.`
        : `Erro ao instalar skill \`${data.name}\`: ${data.error ?? 'desconhecido'}`
      setMessages((prev) => [
        ...prev,
        { id: `skills-inst-${Date.now()}`, role: 'assistant' as const, content },
      ])
    })

    // /skills — lista skills instaladas (distinguido pela flag pendingSkillsListRef)
    on('skill:list:result', (d: unknown) => {
      if (!pendingSkillsListRef.current) return
      pendingSkillsListRef.current = false
      const data = d as { skills: SkillInfo[] }
      const list = data.skills.map((s) => `- **${s.name}**: ${s.description}`).join('\n')
      setMessages((prev) => [
        ...prev,
        {
          id: `skills-${Date.now()}`,
          role: 'assistant' as const,
          content: `**Skills instaladas:**\n${list || 'Nenhuma skill instalada.'}`,
        },
      ])
    })

    // /model — mostra modelo e provider (distinguido pela flag pendingModelRef)
    on('config:result', (d: unknown) => {
      if (!pendingModelRef.current) return
      pendingModelRef.current = false
      const data = d as { config: Record<string, unknown> }
      const model = data.config['model'] ?? 'desconhecido'
      const provider = data.config['provider'] ?? 'desconhecido'
      setMessages((prev) => [
        ...prev,
        {
          id: `model-${Date.now()}`,
          role: 'assistant' as const,
          content: `**Modelo:** ${String(model)}\n**Provider:** ${String(provider)}`,
        },
      ])
    })

    // /agents — lista agentes disponíveis
    on('agents:list:result', (d: unknown) => {
      const data = d as { agents: Array<{ name: string; description: string }> }
      const list = data.agents.map((a) => `- **${a.name}**: ${a.description}`).join('\n')
      setMessages((prev) => [
        ...prev,
        {
          id: `agents-${Date.now()}`,
          role: 'assistant' as const,
          content: `**Agentes disponíveis:**\n${list || 'Nenhum agente registrado.'}`,
        },
      ])
    })

    // mention:results é consumido diretamente pelo useAtMention via useMessenger
    // Registrado aqui apenas para evitar warnings de mensagem não tratada

    post({ type: 'ready' })
  }, [])

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || isStreaming) {
        return
      }

      const trimmed = content.trim()

      // /clear — Limpar mensagens
      if (trimmed === '/clear') {
        setMessages([])
        return
      }

      // /help — Mostrar ajuda
      if (trimmed === '/help') {
        setMessages((prev) => [
          ...prev,
          { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
          { id: `help-${Date.now()}`, role: 'assistant' as const, content: HELP_TEXT },
        ])
        return
      }

      // /agents — Listar agentes
      if (trimmed === '/agents') {
        setMessages((prev) => [
          ...prev,
          { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
          {
            id: `msg-sys-${Date.now()}`,
            role: 'assistant' as const,
            content: 'Listando agentes...',
          },
        ])
        post({ type: 'agents:list' })
        return
      }

      // /skills — Listar skills instaladas
      if (trimmed === '/skills') {
        setMessages((prev) => [
          ...prev,
          { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
          {
            id: `msg-sys-${Date.now()}`,
            role: 'assistant' as const,
            content: 'Listando skills instaladas...',
          },
        ])
        pendingSkillsListRef.current = true
        post({ type: 'skill:list' })
        return
      }

      // /model — Mostrar modelo e provider
      if (trimmed === '/model') {
        setMessages((prev) => [
          ...prev,
          { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
        ])
        pendingModelRef.current = true
        post({ type: 'config:list' })
        return
      }

      // /codebase-index — alias para /codebase index
      if (trimmed === '/codebase-index') {
        setMessages((prev) => [
          ...prev,
          { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
        ])
        post({ type: 'codebase:index' })
        return
      }

      // /codebase-search <query> — alias para /codebase <query>
      const codebaseSearchMatch = trimmed.match(/^\/codebase-search\s+(.+)$/)
      if (codebaseSearchMatch) {
        const query = (codebaseSearchMatch[1] ?? '').trim()
        setMessages((prev) => [
          ...prev,
          { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
        ])
        post({ type: 'codebase:search', query })
        return
      }

      // /use-skill <nome>
      const useSkillMatch = trimmed.match(/^\/use-skill\s+(\S+)$/)
      if (useSkillMatch) {
        const name = useSkillMatch[1] ?? ''
        setMessages((prev) => [
          ...prev,
          { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
        ])
        post({ type: 'skill:setActive', name })
        setMessages((prev) => [
          ...prev,
          {
            id: `sys-${Date.now()}`,
            role: 'assistant' as const,
            content: `Skill \`${name}\` ativada! ● As instruções desta skill serão aplicadas nas próximas mensagens. Use \`/clear-skill\` para desativar.`,
          },
        ])
        return
      }

      // /clear-skill
      if (trimmed === '/clear-skill') {
        setMessages((prev) => [
          ...prev,
          { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
        ])
        post({ type: 'skill:clearActive' })
        setMessages((prev) => [
          ...prev,
          {
            id: `sys-${Date.now()}`,
            role: 'assistant' as const,
            content: 'Skill desativada. Voltando ao modo automático.',
          },
        ])
        return
      }

      // /find-skills [query]
      const findSkillsMatch = trimmed.match(/^\/find-skills\s*(.*)$/)
      if (findSkillsMatch) {
        const query = (findSkillsMatch[1] ?? '').trim()
        setMessages((prev) => [
          ...prev,
          { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
          {
            id: `msg-sys-${Date.now()}`,
            role: 'assistant' as const,
            content: 'Buscando skills disponíveis...',
          },
        ])
        post({ type: 'skills:find', query: query || undefined })
        return
      }

      // /install-skill <nome>
      const installSkillMatch = trimmed.match(/^\/install-skill\s+(\S+)$/)
      if (installSkillMatch) {
        const name = installSkillMatch[1] ?? ''
        setMessages((prev) => [
          ...prev,
          { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
          {
            id: `msg-sys-${Date.now()}`,
            role: 'assistant' as const,
            content: `Instalando skill \`${name}\`...`,
          },
        ])
        post({ type: 'skills:install', name })
        return
      }

      // /codebase [query] ou /codebase index (mantém compatibilidade)
      const codebaseMatch = trimmed.match(/^\/codebase\s*(.*)$/)
      if (codebaseMatch) {
        const arg = (codebaseMatch[1] ?? '').trim()
        setMessages((prev) => [
          ...prev,
          { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
        ])
        if (arg === 'index' || arg === '') {
          post({ type: 'codebase:index' })
        } else {
          post({ type: 'codebase:search', query: arg })
        }
        return
      }

      // Nenhum comando reconhecido — envia como chat normal
      setMessages((prev) => [
        ...prev,
        { id: `msg-${++refs.messageId.current}`, role: 'user' as const, content },
      ])
      refs.content.current = ''
      refs.toolCalls.current = []
      setIsStreaming(true)
      post({ type: 'chat:send', content })
    },
    [isStreaming, post, refs, status],
  )

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  const abort = useCallback(() => {
    post({ type: 'chat:abort' })
    setIsStreaming(false)
  }, [post])

  const newSession = useCallback(() => {
    setMessages([])
    refs.content.current = ''
    refs.toolCalls.current = []
    post({ type: 'session:create' })
  }, [post, refs])

  return {
    messages,
    isStreaming,
    session,
    status,
    activeSkill,
    sendMessage,
    clearMessages,
    abort,
    newSession,
  }
}
