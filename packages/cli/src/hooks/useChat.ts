/**
 * Hook useChat — Gerencia estado do chat e streaming.
 *
 * Consome o AsyncGenerator<OrchestratorEvent> do core e traduz
 * os eventos em estado React para os componentes renderizarem.
 *
 * Funcionalidades:
 * - Slash commands: /clear, /help, /agents, /skills, /model, /codebase
 * - @mentions: @arquivo.ts injeta conteúdo do arquivo no prompt
 * - Streaming de respostas do LLM via orchestrator
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { useCallback, useRef, useState } from 'react'
import type { AthionCore } from '@athion/core'
import type { ChatMessage, SubAgentInfo, TokenInfo, ToolCallInfo } from '../types.js'

interface UseChatReturn {
  messages: ChatMessage[]
  isStreaming: boolean
  currentTool: ToolCallInfo | null
  currentAgent: SubAgentInfo | null
  tokens: TokenInfo | null
  sendMessage: (content: string) => Promise<void>
  clearMessages: () => void
}

/** Cria mensagem de sistema local (não vai para o LLM). */
function systemMsg(content: string): ChatMessage {
  return { id: crypto.randomUUID(), role: 'assistant', content, timestamp: new Date() }
}

/** Resolve @mentions em paths e injeta conteúdo do arquivo no prompt. */
function resolveAtMentions(content: string): string {
  return content.replace(/@([\w./-]+)/g, (_match, filePath: string) => {
    const resolved = resolve(process.cwd(), filePath)
    if (!existsSync(resolved)) return `@${filePath} (arquivo não encontrado)`
    try {
      const fileContent = readFileSync(resolved, 'utf-8')
      const lines = fileContent.split('\n')
      const truncated =
        lines.length > 200
          ? lines.slice(0, 200).join('\n') + `\n... (${lines.length - 200} linhas omitidas)`
          : fileContent
      return `[Conteúdo de ${filePath}]:\n\`\`\`\n${truncated}\n\`\`\``
    } catch {
      return `@${filePath} (erro ao ler)`
    }
  })
}

export function useChat(
  core: AthionCore,
  sessionId: string,
  onPermissionRequest?: (toolName: string, target: string) => Promise<'allow' | 'deny'>,
): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [currentTool, setCurrentTool] = useState<ToolCallInfo | null>(null)
  const [currentAgent, setCurrentAgent] = useState<SubAgentInfo | null>(null)
  const [tokens, setTokens] = useState<TokenInfo | null>(null)
  const streamingContentRef = useRef('')

  const clearMessages = useCallback(() => {
    setMessages([])
    setTokens(null)
  }, [])

  /** Processa slash commands. Retorna true se foi um comando. */
  function handleSlashCommand(content: string): boolean {
    const trimmed = content.trim()
    if (!trimmed.startsWith('/')) return false

    const [cmd, ...args] = trimmed.slice(1).split(/\s+/)
    const arg = args.join(' ')

    switch (cmd) {
      case 'clear': {
        clearMessages()
        return true
      }
      case 'help': {
        setMessages((prev) => [
          ...prev,
          systemMsg(
            '**Comandos disponíveis:**\n' +
              '- `/clear` — Limpar mensagens\n' +
              '- `/help` — Mostrar esta ajuda\n' +
              '- `/agents` — Listar agentes disponíveis\n' +
              '- `/skills` — Listar skills disponíveis\n' +
              '- `/model` — Mostrar modelo atual\n' +
              '- `/codebase index` — Indexar projeto\n' +
              '- `/codebase <query>` — Buscar no código\n\n' +
              '**Menções:**\n' +
              '- `@arquivo.ts` — Inclui conteúdo do arquivo no prompt',
          ),
        ])
        return true
      }
      case 'agents': {
        const agents = core.subagents.list()
        const list = agents.map((a) => `- **${a.name}**: ${a.description}`).join('\n')
        setMessages((prev) => [...prev, systemMsg(`**Agentes disponíveis:**\n${list}`)])
        return true
      }
      case 'skills': {
        const skills = core.skills.list()
        const list = skills.map((s) => `- **${s.name}**: ${s.description}`).join('\n')
        setMessages((prev) => [...prev, systemMsg(`**Skills disponíveis:**\n${list}`)])
        return true
      }
      case 'model': {
        const model = core.config.get('model')
        const provider = core.config.get('provider')
        setMessages((prev) => [
          ...prev,
          systemMsg(`**Modelo:** ${model}\n**Provider:** ${provider}`),
        ])
        return true
      }
      case 'codebase': {
        if (!core.indexer) {
          setMessages((prev) => [
            ...prev,
            systemMsg('Indexador não disponível. Inicie com `workspacePath` configurado.'),
          ])
          return true
        }
        if (arg === 'index' || arg === '') {
          setMessages((prev) => [...prev, systemMsg('Indexando codebase...')])
          core.indexer
            .indexWorkspace()
            .then((stats: { totalFiles: number; totalChunks: number }) => {
              setMessages((prev) => [
                ...prev,
                systemMsg(`Indexado: ${stats.totalFiles} arquivos, ${stats.totalChunks} chunks.`),
              ])
            })
            .catch((err: Error) => {
              setMessages((prev) => [...prev, systemMsg(`Erro: ${err.message}`)])
            })
        } else {
          core.indexer
            .search(arg)
            .then(
              (
                results: Array<{ chunk: { filePath: string; startLine: number }; score: number }>,
              ) => {
                if (results.length === 0) {
                  setMessages((prev) => [...prev, systemMsg(`Nenhum resultado para "${arg}".`)])
                } else {
                  const list = results
                    .slice(0, 10)
                    .map(
                      (r, i) =>
                        `${i + 1}. \`${r.chunk.filePath}:${r.chunk.startLine}\` [${Math.round(r.score * 100)}%]`,
                    )
                    .join('\n')
                  setMessages((prev) => [
                    ...prev,
                    systemMsg(`**Resultados para "${arg}":**\n${list}`),
                  ])
                }
              },
            )
            .catch((err: Error) => {
              setMessages((prev) => [...prev, systemMsg(`Erro: ${err.message}`)])
            })
        }
        return true
      }
      default:
        return false
    }
  }

  const sendMessage = useCallback(
    async (content: string) => {
      // Slash commands interceptados localmente
      if (handleSlashCommand(content)) return

      // Resolve @mentions para incluir conteúdo de arquivos
      const resolvedContent = content.includes('@') ? resolveAtMentions(content) : content

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMsg])
      setIsStreaming(true)
      streamingContentRef.current = ''

      const assistantId = crypto.randomUUID()
      const toolCalls: ToolCallInfo[] = []

      try {
        const stream = core.orchestrator.chat(sessionId, {
          content: resolvedContent,
          ...(onPermissionRequest ? { onPermissionRequest } : {}),
        })

        for await (const event of stream) {
          switch (event.type) {
            case 'content':
              streamingContentRef.current += event.content
              updateAssistantMessage(assistantId, streamingContentRef.current, toolCalls)
              break

            case 'tool_call':
              handleToolCallEvent(event, toolCalls)
              break

            case 'tool_result':
              handleToolResult(event, toolCalls)
              updateAssistantMessage(assistantId, streamingContentRef.current, toolCalls)
              break

            case 'subagent_start':
              setCurrentAgent({ name: event.agentName, status: 'running', continuations: 0 })
              break

            case 'subagent_complete':
              setCurrentAgent(null)
              break

            case 'finish':
              setTokens({
                promptTokens: event.usage.promptTokens,
                completionTokens: event.usage.completionTokens,
                totalTokens: event.usage.totalTokens,
              })
              break
          }
        }
      } finally {
        setIsStreaming(false)
        setCurrentTool(null)
        setCurrentAgent(null)
      }
    },
    [core, sessionId, onPermissionRequest],
  )

  function updateAssistantMessage(id: string, content: string, tools: ToolCallInfo[]) {
    setMessages((prev) => {
      const existing = prev.find((m) => m.id === id)
      if (existing) {
        return prev.map((m) => (m.id === id ? { ...m, content, toolCalls: [...tools] } : m))
      }
      return [
        ...prev,
        {
          id,
          role: 'assistant' as const,
          content,
          timestamp: new Date(),
          toolCalls: [...tools],
        },
      ]
    })
  }

  function handleToolCallEvent(
    event: { id: string; name: string; args: unknown },
    toolCalls: ToolCallInfo[],
  ) {
    const tc: ToolCallInfo = {
      id: event.id,
      name: event.name,
      args: event.args,
      status: 'running',
    }
    toolCalls.push(tc)
    setCurrentTool(tc)
  }

  function handleToolResult(
    event: { id: string; name: string; result: { success: boolean; error?: string } },
    toolCalls: ToolCallInfo[],
  ) {
    const tc = toolCalls.find((t) => t.name === event.name && t.status === 'running')
    if (tc) {
      tc.status = event.result.success ? 'success' : 'error'
      tc.result = event.result.success
        ? JSON.stringify(event.result).slice(0, 200)
        : event.result.error
    }
    setCurrentTool(null)
  }

  return { messages, isStreaming, currentTool, currentAgent, tokens, sendMessage, clearMessages }
}
