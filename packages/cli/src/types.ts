/**
 * Tipos compartilhados do CLI.
 * Representam o estado interno que hooks e componentes usam.
 * São derivados dos OrchestratorEvent do core, mas simplificados para a UI.
 */

/** ChatMessage
 * Descrição: Mensagem no histórico do chat, representando uma interação do usuário, assistente ou sistema.
 */
export interface ChatMessage {
  /** Identificador único da mensagem */
  id: string
  /** Papel do autor da mensagem: usuário, assistente ou sistema */
  role: 'user' | 'assistant' | 'system'
  /** Conteúdo textual da mensagem */
  content: string
  /** Data e hora em que a mensagem foi criada */
  timestamp: Date
  /** Lista de chamadas de ferramentas associadas à mensagem */
  toolCalls?: ToolCallInfo[]
  /** Informações do subagente que processou a mensagem */
  subagent?: SubAgentInfo
}

/** ToolCallInfo
 * Descrição: Informação sobre uma chamada de ferramenta em andamento ou concluída.
 */
export interface ToolCallInfo {
  /** Identificador único da chamada de ferramenta */
  id: string
  /** Nome da ferramenta chamada */
  name: string
  /** Argumentos passados para a ferramenta */
  args: unknown
  /** Estado atual da chamada: pendente, executando, sucesso ou erro */
  status: 'pending' | 'running' | 'success' | 'error'
  /** Resultado retornado pela ferramenta, se disponível */
  result?: string | undefined
}

/** SubAgentInfo
 * Descrição: Informação sobre um subagente em andamento ou concluído.
 */
export interface SubAgentInfo {
  /** Nome do subagente */
  name: string
  /** Estado atual do subagente: executando, completo ou falhou */
  status: 'running' | 'completed' | 'failed'
  /** Número de continuações realizadas pelo subagente */
  continuations: number
}

/** Theme
 * Descrição: Definição de cores de um tema visual do CLI.
 */
export interface Theme {
  /** Nome identificador do tema */
  name: string
  /** Cor primária principal */
  primary: string
  /** Cor secundária */
  secondary: string
  /** Cor de destaque/acento */
  accent: string
  /** Cor para indicar erros */
  error: string
  /** Cor para indicar sucesso */
  success: string
  /** Cor para indicar avisos */
  warning: string
  /** Cor para texto atenuado/secundário */
  muted: string
}

/** TokenInfo
 * Descrição: Informações de uso de tokens do modelo LLM.
 */
export interface TokenInfo {
  /** Quantidade de tokens usados no prompt de entrada */
  promptTokens: number
  /** Quantidade de tokens gerados na resposta */
  completionTokens: number
  /** Total de tokens consumidos (prompt + resposta) */
  totalTokens: number
}
