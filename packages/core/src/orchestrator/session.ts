import type { DatabaseManager } from '../storage/db'
import type { TokenManager } from '../tokens/types'
import type { Session } from './types'

/** SessionManager
 * Descrição: Interface do SessionManager.
 * Camada entre o Orchestrator e o DatabaseManager para operações de sessão.
 */
export interface SessionManager {
  /** create
   * Descrição: Cria nova sessão para um projeto
   * @param projectId - ID do projeto ao qual a sessão pertence
   * @param title - Título opcional da sessão
   * @returns A sessão criada
   */
  create(projectId: string, title?: string): Session
  /** load
   * Descrição: Carrega sessão existente pelo ID
   * @param sessionId - ID da sessão a carregar
   * @returns A sessão carregada
   */
  load(sessionId: string): Session
  /** list
   * Descrição: Lista sessões de um projeto
   * @param projectId - ID do projeto ao qual as sessões pertencem (opcional)
   * @returns Array de sessões
   */
  list(projectId?: string): Session[]
  /** delete
   * Descrição: Deleta sessão e todas as mensagens
   * @param sessionId - ID da sessão a deletar
   */
  delete(sessionId: string): void
  /** getMessages
   * Descrição: Retorna mensagens da sessão no formato para o LLM
   * @param sessionId - ID da sessão
   * @returns Array de mensagens com role e content
   */
  getMessages(sessionId: string): Array<{ role: string; content: string }>
  /** addMessage
   * Descrição: Adiciona mensagem a uma sessão
   * @param sessionId - ID da sessão
   * @param role - Papel da mensagem (user, assistant, system, tool)
   * @param content - Conteúdo textual da mensagem
   */
  addMessage(sessionId: string, role: string, content: string): void
  /** compress
   * Descrição: Aplica compactação nas mensagens da sessão.
   * Async porque a estratégia 'summarize' chama o LLM.
   * @param sessionId - ID da sessão a aplicar compactação
   * @returns Promise que resolve quando a compactação termina
   */
  compress(sessionId: string): Promise<void>
}

/** createSessionManager
 * Descrição: Cria uma instância do SessionManager.
 * Converte entre o formato do Storage (parts JSON) e o formato simples do Orchestrator.
 * @param db - DatabaseManager para persistência
 * @param tokens - TokenManager para compactação
 * @returns Instância do SessionManager
 */
export function createSessionManager(db: DatabaseManager, tokens: TokenManager): SessionManager {
  /** create
   * Descrição: Cria nova sessão para um projeto
   * @param projectId - ID do projeto
   * @param title - Título opcional da sessão
   * @returns A sessão criada
   */
  function create(projectId: string, title?: string): Session {
    const raw = db.createSession(projectId, title)
    return toSession(raw)
  }

  /** load
   * Descrição: Carrega sessão existente pelo ID
   * @param sessionId - ID da sessão a carregar
   * @returns A sessão carregada
   */
  function load(sessionId: string): Session {
    const raw = db.getSession(sessionId)
    if (!raw) throw new Error(`Session "${sessionId}" not found`)
    return toSession(raw)
  }

  /** list
   * Descrição: Lista sessões, opcionalmente filtradas por projeto
   * @param projectId - ID do projeto (opcional)
   * @returns Array de sessões
   */
  function list(projectId?: string): Session[] {
    return db.listSessions(projectId).map(toSession)
  }

  /** del
   * Descrição: Deleta sessão e todas as mensagens associadas
   * @param sessionId - ID da sessão a deletar
   */
  function del(sessionId: string): void {
    db.deleteSession(sessionId)
  }

  /** getMessages
   * Descrição: Retorna mensagens da sessão convertidas do formato Storage para formato simples
   * @param sessionId - ID da sessão
   * @returns Array de mensagens com role e content
   */
  function getMessages(sessionId: string): Array<{ role: string; content: string }> {
    return db.getMessages(sessionId).map((msg) => ({
      role: msg.role,
      content: extractContent(msg.parts),
    }))
  }

  /** addMessage
   * Descrição: Adiciona mensagem à sessão no formato Storage (parts JSON)
   * @param sessionId - ID da sessão
   * @param role - Papel da mensagem
   * @param content - Conteúdo textual da mensagem
   */
  function addMessage(sessionId: string, role: string, content: string): void {
    db.addMessage(sessionId, {
      role: role as 'user' | 'assistant' | 'system' | 'tool',
      parts: [{ type: 'text', text: content }],
    })
  }

  /** compress
   * Descrição: Aplica compactação nas mensagens da sessão via TokenManager
   * @param sessionId - ID da sessão a compactar
   * @returns Promise que resolve quando a compactação termina
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

/** toSession
 * Descrição: Converte sessão do formato do Storage para o formato do Orchestrator
 * @param raw - Sessão no formato do Storage
 * @returns Sessão no formato do Orchestrator
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

/** extractContent
 * Descrição: Extrai texto de parts JSON no formato do Storage
 * @param parts - Parts JSON (array de objetos com type e text)
 * @returns Texto extraído concatenado
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
