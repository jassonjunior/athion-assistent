import type { DatabaseManager } from '../storage/db'
import type { TokenManager } from '../tokens/types'
import type { Session } from './types'

/**
 * Interface do SessionManager.
 * Camada entre o Orchestrator e o DatabaseManager para operacoes de sessao.
 */
export interface SessionManager {
  /**
   * Cria nova sessao para um projeto
   * @param projectId - ID do projeto ao qual a sessao pertence
   * @param title - Titulo opcional da sessao
   * @returns A sessao criada
   */
  create(projectId: string, title?: string): Session
  /**
   * Carrega sessao existente pelo ID
   * @param sessionId - ID da sessao a carregar
   * @returns A sessao carregada
   */
  load(sessionId: string): Session
  /**
   * Lista sessoes de um projeto
   * @param projectId - ID do projeto ao qual as sessoes pertencem
   * @returns Array de sessoes
   */
  list(projectId?: string): Session[]
  /**
   * Deleta sessao e todas as mensagens
   * @param sessionId - ID da sessao a deletar
   */
  delete(sessionId: string): void
  /**
   * Retorna mensagens da sessao no formato para o LLM
   * @param sessionId - ID da sessao a obter as mensagens
   * @returns Array de mensagens
   */
  getMessages(sessionId: string): Array<{ role: string; content: string }>
  /**
   * Adiciona mensagem a sessao
   * @param sessionId - ID da sessao a adicionar a mensagem
   * @param role - Role da mensagem
   * @param content - Conteudo da mensagem
   */
  addMessage(sessionId: string, role: string, content: string): void
  /**
   * Aplica compaction nas mensagens da sessao.
   * Async porque a estrategia 'summarize' chama o LLM.
   * @param sessionId - ID da sessao a aplicar compaction
   */
  compress(sessionId: string): Promise<void>
}

/**
 * Cria uma instancia do SessionManager.
 * Converte entre o formato do Storage (parts JSON) e o formato simples do Orchestrator.
 * @param db - DatabaseManager para persistencia
 * @param tokens - TokenManager para compaction
 * @returns Instancia do SessionManager
 */
export function createSessionManager(db: DatabaseManager, tokens: TokenManager): SessionManager {
  function create(projectId: string, title?: string): Session {
    const raw = db.createSession(projectId, title)
    return toSession(raw)
  }

  /**
   * Carrega sessao existente pelo ID
   * @param sessionId - ID da sessao a carregar
   * @returns A sessao carregada
   */
  function load(sessionId: string): Session {
    const raw = db.getSession(sessionId)
    if (!raw) throw new Error(`Session "${sessionId}" not found`)
    return toSession(raw)
  }

  /**
   * Lista sessoes de um projeto
   * @param projectId - ID do projeto ao qual as sessoes pertencem
   * @returns Array de sessoes
   */
  function list(projectId?: string): Session[] {
    return db.listSessions(projectId).map(toSession)
  }

  /**
   * Deleta sessao e todas as mensagens
   * @param sessionId - ID da sessao a deletar
   */
  function del(sessionId: string): void {
    db.deleteSession(sessionId)
  }

  /**
   * Retorna mensagens da sessao no formato para o LLM
   * @param sessionId - ID da sessao a obter as mensagens
   * @returns Array de mensagens
   */
  function getMessages(sessionId: string): Array<{ role: string; content: string }> {
    return db.getMessages(sessionId).map((msg) => ({
      role: msg.role,
      content: extractContent(msg.parts),
    }))
  }

  /**
   * Adiciona mensagem a sessao
   * @param sessionId - ID da sessao a adicionar a mensagem
   * @param role - Role da mensagem
   * @param content - Conteudo da mensagem
   */
  function addMessage(sessionId: string, role: string, content: string): void {
    db.addMessage(sessionId, {
      role: role as 'user' | 'assistant' | 'system' | 'tool',
      parts: [{ type: 'text', text: content }],
    })
  }

  /**
   * Aplica compaction nas mensagens da sessao
   * @param sessionId - ID da sessao a aplicar compaction
   */
  async function compress(sessionId: string): Promise<void> {
    const messages = getMessages(sessionId)
    const compacted = await tokens.compact(messages)
    db.deleteMessages(sessionId)
    for (const msg of compacted) {
      addMessage(sessionId, msg.role, msg.content)
    }
  }

  return { create, load, list, delete: del, getMessages, addMessage, compress }
}

/**
 * Converte sessao do Storage para o formato do Orchestrator.
 * @param raw - Sessao do Storage
 * @returns Sessao no formato do Orchestrator
 */
function toSession(raw: {
  id: string
  projectId: string
  title: string | null
  createdAt: Date
  updatedAt: Date
}): Session {
  return {
    id: raw.id,
    projectId: raw.projectId,
    title: raw.title ?? '',
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  }
}

/**
 * Extrai texto de parts JSON (formato do Storage).
 * @param parts - Parts JSON
 * @returns Texto extraido
 */
function extractContent(parts: unknown): string {
  if (Array.isArray(parts)) {
    return parts
      .filter(
        (p): p is { type: string; text: string } =>
          p?.type === 'text' && typeof p?.text === 'string',
      )
      .map((p) => p.text)
      .join('\n')
  }
  return String(parts)
}
