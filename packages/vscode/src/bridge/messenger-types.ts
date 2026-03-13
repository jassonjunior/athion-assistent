/**
 * messenger-types
 * Descrição: Tipos de mensagens entre Extension (Node.js) e Webview (React).
 * Comunicação via vscode.Webview.postMessage / acquireVsCodeApi().postMessage.
 * Discriminated unions pelo campo `type` para type safety.
 */

import type { ChatEventNotification, SessionInfo } from './protocol.js'

// ─── Webview → Extension ──────────────────────────────────────────

/**
 * WebviewToExtension
 * Descrição: União discriminada de todas as mensagens que o Webview pode enviar para a Extension.
 * O campo `type` identifica o tipo de cada mensagem.
 */
export type WebviewToExtension =
  | { /** Envia mensagem de chat */ type: 'chat:send'; /** Conteúdo da mensagem */ content: string }
  | { /** Aborta o chat em andamento */ type: 'chat:abort' }
  | {
      /** Cria nova sessão */ type: 'session:create'
      /** Título opcional da sessão */ title?: string | undefined
    }
  | { /** Lista sessões existentes */ type: 'session:list' }
  | {
      /** Seleciona sessão pelo id */ type: 'session:select'
      /** ID da sessão a selecionar */ id: string
    }
  | {
      /** Deleta sessão pelo id */ type: 'session:delete'
      /** ID da sessão a deletar */ id: string
    }
  | { /** Lista configurações */ type: 'config:list' }
  | { /** Indexa o codebase */ type: 'codebase:index' }
  | {
      /** Busca no codebase */ type: 'codebase:search'
      /** Query de busca */ query: string
      /** Limite de resultados */ limit?: number
    }
  | { /** Busca menção por @mention */ type: 'mention:search'; /** Query de busca */ query: string }
  | {
      /** Busca skills no registry */ type: 'skills:find'
      /** Query opcional de busca */ query?: string
    }
  | {
      /** Instala uma skill */ type: 'skills:install'
      /** Nome da skill a instalar */ name: string
    }
  | { /** Ativa uma skill */ type: 'skill:setActive'; /** Nome da skill a ativar */ name: string }
  | { /** Desativa a skill ativa */ type: 'skill:clearActive' }
  | { /** Lista skills instaladas */ type: 'skill:list' }
  | {
      /** Lista arquivos com prefixo */ type: 'files:list'
      /** Prefixo para filtrar arquivos */ prefix: string
    }
  | { /** Lista agentes disponíveis */ type: 'agents:list' }
  | { /** Sinaliza que o webview está pronto */ type: 'ready' }

// ─── Extension → Webview ──────────────────────────────────────────

/**
 * ExtensionToWebview
 * Descrição: União discriminada de todas as mensagens que a Extension pode enviar para o Webview.
 * O campo `type` identifica o tipo de cada mensagem.
 */
export type ExtensionToWebview =
  | {
      /** Evento de chat (streaming) */ type: 'chat:event'
      /** Dados do evento */ event: ChatEventNotification
    }
  | { /** Chat completou */ type: 'chat:complete' }
  | { /** Sessão criada */ type: 'session:created'; /** Dados da sessão */ session: SessionInfo }
  | {
      /** Resultado da listagem de sessões */ type: 'session:list:result'
      /** Lista de sessões */ sessions: SessionInfo[]
    }
  | {
      /** Sessão ativa alterada */ type: 'session:active'
      /** Dados da sessão ativa */ session: SessionInfo
    }
  | {
      /** Atualização de status do core */ type: 'status:update'
      /** Novo status */ status: CoreStatus
    }
  | {
      /** Contexto de seleção do editor */ type: 'context:selection'
      /** Texto selecionado */ text: string
      /** Linguagem do arquivo */ language: string
      /** Caminho do arquivo */ filePath: string
    }
  | {
      /** Resultado de configuração */ type: 'config:result'
      /** Mapa de configurações */ config: Record<string, unknown>
    }
  | {
      /** Resultado de busca no codebase */ type: 'codebase:result'
      /** Resultados encontrados */ results: CodebaseSearchResult[]
      /** Query original */ query: string
    }
  | {
      /** Codebase indexado com sucesso */ type: 'codebase:indexed'
      /** Total de arquivos */ totalFiles: number
      /** Total de chunks */ totalChunks: number
    }
  | { /** Erro no codebase */ type: 'codebase:error'; /** Mensagem de erro */ message: string }
  | {
      /** Resultados de busca de menção */ type: 'mention:results'
      /** Resultados encontrados */ results: MentionResult[]
      /** Query original */ query: string
    }
  | {
      /** Skills encontradas no registry */ type: 'skills:found'
      /** Resultados encontrados */ results: SkillSearchResult[]
      /** Query original */ query?: string
    }
  | {
      /** Resultado da instalação de skill */ type: 'skills:installed'
      /** Nome da skill */ name: string
      /** Se foi bem-sucedida */ success: boolean
      /** Mensagem de erro opcional */ error?: string
    }
  | {
      /** Skill ativa alterada */ type: 'skill:active'
      /** Nome da skill ativa ou null */ name: string | null
    }
  | {
      /** Resultado da listagem de skills */ type: 'skill:list:result'
      /** Lista de skills */ skills: SkillInfo[]
    }
  | {
      /** Resultado da listagem de arquivos */ type: 'files:list:result'
      /** Lista de caminhos */ files: string[]
      /** Prefixo usado */ prefix: string
    }
  | {
      /** Resultado da listagem de agentes */ type: 'agents:list:result'
      /** Lista de agentes */ agents: AgentInfo[]
    }
  | {
      /** Define o locale do webview */ type: 'locale:set'
      /** Código do locale (ex: pt-BR) */ locale: string
    }

/**
 * MentionResult
 * Descrição: Resultado de uma busca de menção (@mention) no codebase indexado.
 */
export interface MentionResult {
  /** Caminho relativo do arquivo encontrado */
  file: string
  /** Linha inicial do trecho encontrado */
  startLine: number
  /** Nome do símbolo encontrado (função, classe, etc.), se disponível */
  symbolName?: string
  /** Tipo do chunk (function, class, method, etc.) */
  chunkType: string
  /** Pontuação de relevância (0 a 1) */
  score: number
}

/**
 * CodebaseSearchResult
 * Descrição: Resultado de uma busca semântica no codebase indexado.
 */
export interface CodebaseSearchResult {
  /** Caminho relativo do arquivo */
  file: string
  /** Linha inicial do trecho */
  startLine: number
  /** Linha final do trecho */
  endLine: number
  /** Linguagem de programação do arquivo */
  language: string
  /** Nome do símbolo, se disponível */
  symbolName?: string
  /** Tipo do chunk (function, class, etc.) */
  chunkType: string
  /** Pontuação de relevância (0 a 1) */
  score: number
  /** Fonte do resultado (ex: embeddings, keywords) */
  source: string
  /** Conteúdo textual do trecho encontrado */
  content: string
}

/**
 * SkillSearchResult
 * Descrição: Resultado de uma busca de skills no registry.
 */
export interface SkillSearchResult {
  /** Nome do pacote da skill */
  packageName: string
  /** Nome do plugin */
  pluginName: string
  /** Descrição da skill */
  description: string
  /** Versão da skill */
  version: string
  /** Autor da skill, se disponível */
  author?: string
}

/**
 * SkillInfo
 * Descrição: Informações de uma skill instalada localmente.
 */
export interface SkillInfo {
  /** Nome identificador da skill */
  name: string
  /** Descrição do que a skill faz */
  description: string
  /** Lista de triggers que ativam a skill automaticamente */
  triggers: string[]
}

/**
 * AgentInfo
 * Descrição: Informações de um agente disponível no sistema.
 */
export interface AgentInfo {
  /** Nome identificador do agente */
  name: string
  /** Descrição do que o agente faz */
  description: string
}

/**
 * CoreStatus
 * Descrição: Estados possíveis do processo core (child process Bun).
 */
export type CoreStatus = 'starting' | 'ready' | 'error' | 'stopped'
