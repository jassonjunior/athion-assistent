/**
 * Status de uma task atribuida a um subagente.
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'partial'

/**
 * Task atribuida a um subagente pelo orquestrador.
 * O subagente recebe a task e vai atualizando conforme progride.
 */
export interface SubAgentTask {
  /** Identificador unico da task */
  id: string
  /** Nome curto da task (ex: 'review-auth-module') */
  name: string
  /** Descricao detalhada do que o subagente precisa fazer */
  description: string
  /** Status atual da task */
  status: TaskStatus
  /** Resultado parcial ou final da task */
  result?: string
  /** Sub-tarefas que o agente pode criar para organizar o trabalho */
  steps: TaskStep[]
  /** Resultados acumulados de todas as continuações */
  accumulatedResults: string[]
  /** Índice da continuação atual (0 = primeira execução) */
  continuationIndex: number
  /** Máximo de continuações permitidas */
  maxContinuations: number
  /** Descrição do que resta fazer (preenchido ao sair com status 'partial') */
  remainingWork?: string
  /** Timestamp de criacao */
  createdAt: Date
  /** Timestamp da ultima atualizacao */
  updatedAt: Date
}

/**
 * Sub-tarefa dentro de uma task.
 * O subagente cria steps para organizar seu trabalho.
 */
export interface TaskStep {
  /** Descricao do step */
  description: string
  /** Se o step foi concluido */
  completed: boolean
}

/**
 * Configuracao completa de um subagente.
 * Define skill, tools permitidas, modelo e limites.
 */
export interface SubAgentConfig {
  /** Identificador unico do agente (ex: 'code-reviewer') */
  name: string
  /** Descricao do que o agente faz */
  description: string
  /** Nome da skill que fornece o system prompt */
  skill: string
  /** Whitelist de tools que o agente pode usar */
  tools: string[]
  /** Provider e modelo especificos (opcional, usa o default se omitido) */
  model?: { provider: string; model: string }
  /** Limite de turnos para evitar loops infinitos (default: 50) */
  maxTurns?: number
  /** Nivel do agente — determina prioridade e origem */
  level: 'builtin' | 'user' | 'project' | 'session'
}

/**
 * Evento emitido durante a execucao de um subagente.
 * Discriminated union pelo campo `type`.
 */
export type SubAgentEvent =
  | { type: 'start'; agentName: string; task: SubAgentTask }
  | { type: 'content'; content: string }
  | { type: 'tool_call'; toolName: string; args: unknown }
  | { type: 'tool_result'; toolName: string; result: unknown }
  | { type: 'task_update'; task: SubAgentTask }
  | { type: 'complete'; task: SubAgentTask }
  | { type: 'continuation_needed'; task: SubAgentTask }
  | { type: 'error'; error: Error; task: SubAgentTask }

/**
 * Informacoes resumidas de um subagente registrado.
 */
export interface SubAgentInfo {
  name: string
  description: string
  skill: string
  tools: string[]
  level: SubAgentConfig['level']
}

/**
 * Interface do SubAgent Manager.
 * Centraliza registro, busca e execucao de subagentes.
 */
export interface SubAgentManager {
  /** Executa um subagente com uma task especifica */
  spawn(
    config: SubAgentConfig,
    task: SubAgentTask,
    signal?: AbortSignal,
  ): AsyncGenerator<SubAgentEvent>
  /** Lista todos os subagentes registrados */
  list(): SubAgentInfo[]
  /** Busca um subagente pelo nome */
  getAgent(name: string): SubAgentConfig | undefined
  /** Registra um novo subagente */
  registerAgent(config: SubAgentConfig): void
}
