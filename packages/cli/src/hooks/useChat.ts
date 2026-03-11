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
import { createPluginInstaller } from '@athion/core'
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
  addMessage: (content: string) => void
  skillsMenuOpen: boolean
  setSkillsMenuOpen: (open: boolean) => void
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
  const [skillsMenuOpen, setSkillsMenuOpen] = useState(false)
  const streamingContentRef = useRef('')

  const clearMessages = useCallback(() => {
    setMessages([])
    setTokens(null)
  }, [])

  const addMessage = useCallback((content: string) => {
    setMessages((prev) => [...prev, systemMsg(content)])
  }, [])

  /** Processa slash commands. Retorna true se foi um comando. */
  function handleSlashCommand(content: string): boolean {
    const trimmed = content.trim()
    if (!trimmed.startsWith('/')) return false

    // Extrai o comando (tudo após "/" até o primeiro espaço) e o argumento restante
    const withoutSlash = trimmed.slice(1)
    const spaceIdx = withoutSlash.indexOf(' ')
    const cmd = spaceIdx === -1 ? withoutSlash : withoutSlash.slice(0, spaceIdx)
    const arg = spaceIdx === -1 ? '' : withoutSlash.slice(spaceIdx + 1).trim()

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
              '- `/skills` — Gerenciar skills instaladas\n' +
              '- `/find-skills [query]` — Buscar novas skills no registry\n' +
              '- `/install-skill <nome>` — Instalar uma skill\n' +
              '- `/use-skill <nome>` — Ativar uma skill explicitamente\n' +
              '- `/clear-skill` — Desativar skill ativa\n' +
              '- `/model` — Mostrar modelo atual\n' +
              '- `/codebase-index` — Indexar projeto\n' +
              '- `/codebase-search <query>` — Buscar no código\n\n' +
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
        setSkillsMenuOpen(true)
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
      case 'codebase-index': {
        if (!core.indexer) {
          setMessages((prev) => [
            ...prev,
            systemMsg('Indexador não disponível. Verifique o workspacePath.'),
          ])
          return true
        }
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
        return true
      }
      case 'use-skill': {
        if (!arg) {
          const skillList = core.skills
            .list()
            .map((s) => `- \`${s.name}\` — ${s.description}`)
            .join('\n')
          setMessages((prev) => [
            ...prev,
            systemMsg(`**Skills disponíveis:**\n${skillList}\n\nUso: \`/use-skill <nome>\``),
          ])
          return true
        }
        const skill = core.skills.get(arg)
        if (!skill) {
          setMessages((prev) => [
            ...prev,
            systemMsg(
              `Skill \`${arg}\` não encontrada. Use \`/use-skill\` para ver as disponíveis.`,
            ),
          ])
          return true
        }
        core.skills.setActive(arg)
        setMessages((prev) => [
          ...prev,
          systemMsg(
            `**Skill \`${skill.name}\` ativada!** ●\n\n*${skill.description}*\n\nAs instruções desta skill serão aplicadas nas próximas mensagens. Use \`/clear-skill\` para desativar.`,
          ),
        ])
        return true
      }
      case 'clear-skill': {
        const active = core.skills.getActive()
        core.skills.clearActive()
        setMessages((prev) => [
          ...prev,
          systemMsg(
            active
              ? `Skill \`${active.name}\` desativada. Voltando ao modo automático.`
              : 'Nenhuma skill ativa.',
          ),
        ])
        return true
      }
      case 'find-skills': {
        setMessages((prev) => [...prev, systemMsg('Buscando skills disponíveis...')])
        const installer = createPluginInstaller()
        installer
          .search(arg || undefined)
          .then((results) => {
            if (results.length === 0) {
              setMessages((prev) => [
                ...prev,
                systemMsg(
                  arg
                    ? `Nenhuma skill encontrada para "${arg}".`
                    : 'Nenhuma skill disponível no registry ainda.',
                ),
              ])
              return
            }
            const list = results
              .map(
                (r) =>
                  `- **${r.pluginName}** \`v${r.version}\`${r.author ? ` — ${r.author}` : ''}\n  ${r.description}`,
              )
              .join('\n')
            setMessages((prev) => [
              ...prev,
              systemMsg(
                `**Skills disponíveis${arg ? ` para "${arg}"` : ''}:**\n\n${list}\n\n` +
                  `Para instalar: \`/install-skill <nome>\``,
              ),
            ])
          })
          .catch((err: Error) => {
            setMessages((prev) => [...prev, systemMsg(`Erro ao buscar skills: ${err.message}`)])
          })
        return true
      }
      case 'install-skill': {
        if (!arg) {
          setMessages((prev) => [...prev, systemMsg('Uso: `/install-skill <nome>`')])
          return true
        }
        setMessages((prev) => [...prev, systemMsg(`Instalando skill \`${arg}\`...`)])
        const installer = createPluginInstaller()
        installer
          .install(arg)
          .then(async (result) => {
            if (!result.success) {
              setMessages((prev) => [
                ...prev,
                systemMsg(`Erro ao instalar: ${result.error ?? 'desconhecido'}`),
              ])
              return
            }
            if (result.installedPath) {
              await core.skills.loadFromDirectory(result.installedPath)
            }
            setMessages((prev) => [
              ...prev,
              systemMsg(
                `Skill \`${result.pluginName}\` instalada com sucesso! Use \`/skills\` para ver.`,
              ),
            ])
          })
          .catch((err: Error) => {
            setMessages((prev) => [...prev, systemMsg(`Erro: ${err.message}`)])
          })
        return true
      }
      case 'codebase-search': {
        if (!core.indexer) {
          setMessages((prev) => [
            ...prev,
            systemMsg('Indexador não disponível. Execute `/codebase-index` primeiro.'),
          ])
          return true
        }
        if (!arg) {
          setMessages((prev) => [...prev, systemMsg('Uso: `/codebase-search <query>`')])
          return true
        }
        core.indexer
          .search(arg)
          .then(
            (results: Array<{ chunk: { filePath: string; startLine: number }; score: number }>) => {
              if (results.length === 0) {
                setMessages((prev) => [
                  ...prev,
                  systemMsg(
                    `Nenhum resultado para "${arg}". Execute \`/codebase-index\` primeiro.`,
                  ),
                ])
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

  return {
    messages,
    isStreaming,
    currentTool,
    currentAgent,
    tokens,
    sendMessage,
    clearMessages,
    addMessage,
    skillsMenuOpen,
    setSkillsMenuOpen,
  }
}
