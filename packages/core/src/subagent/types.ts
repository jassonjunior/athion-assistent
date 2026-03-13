/** TaskStatus
 * Descrição: Status de uma task atribuída a um subagente.
 * - 'pending': aguardando execução
 * - 'in_progress': em execução
 * - 'completed': finalizada com sucesso
 * - 'failed': falhou durante execução
 * - 'partial': parcialmente completa, necessita continuação
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'partial'

/** SubAgentTask
 * Descrição: Task atribuída a um subagente pelo orquestrador.
 * O subagente recebe a task e vai atualizando conforme progride.
 */
export interface SubAgentTask {
  /** id
   * Descrição: Identificador único da task
   */
  id: string
  /** name
   * Descrição: Nome curto da task (ex: 'review-auth-module')
   */
  name: string
  /** description
   * Descrição: Descrição detalhada do que o subagente precisa fazer
   */
  description: string
  /** status
   * Descrição: Status atual da task
   */
  status: TaskStatus
  /** result
   * Descrição: Resultado parcial ou final da task
   */
  result?: string
  /** steps
   * Descrição: Sub-tarefas que o agente pode criar para organizar o trabalho
   */
  steps: TaskStep[]
  /** accumulatedResults
   * Descrição: Resultados acumulados de todas as continuações anteriores
   */
  accumulatedResults: string[]
  /** continuationIndex
   * Descrição: Índice da continuação atual (0 = primeira execução)
   */
  continuationIndex: number
  /** maxContinuations
   * Descrição: Máximo de continuações permitidas para esta task
   */
  maxContinuations: number
  /** remainingWork
   * Descrição: Descrição do que resta fazer (preenchido ao sair com status 'partial')
   */
  remainingWork?: string
  /** createdAt
   * Descrição: Timestamp de criação da task
   */
  createdAt: Date
  /** updatedAt
   * Descrição: Timestamp da última atualização da task
   */
  updatedAt: Date
}

/** TaskStep
 * Descrição: Sub-tarefa dentro de uma task.
 * O subagente cria steps para organizar seu trabalho.
 */
export interface TaskStep {
  /** description
   * Descrição: Texto descritivo do step
   */
  description: string
  /** completed
   * Descrição: Indica se o step foi concluído
   */
  completed: boolean
}

/** SubAgentConfig
 * Descrição: Configuração completa de um subagente.
 * Define skill, tools permitidas, modelo e limites.
 */
export interface SubAgentConfig {
  /** name
   * Descrição: Identificador único do agente (ex: 'code-reviewer')
   */
  name: string
  /** description
   * Descrição: Texto descritivo do que o agente faz
   */
  description: string
  /** skill
   * Descrição: Nome da skill que fornece o system prompt do agente
   */
  skill: string
  /** tools
   * Descrição: Whitelist de tools que o agente pode usar
   */
  tools: string[]
  /** model
   * Descrição: Provider e modelo específicos (opcional, usa o default se omitido)
   */
  model?: { provider: string; model: string }
  /** maxTurns
   * Descrição: Limite de turnos para evitar loops infinitos (default: 50)
   */
  maxTurns?: number
  /** level
   * Descrição: Nível do agente — determina prioridade e origem
   */
  level: 'builtin' | 'user' | 'project' | 'session'
}

/** SubAgentEvent
 * Descrição: Evento emitido durante a execução de um subagente.
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

/** SubAgentInfo
 * Descrição: Informações resumidas de um subagente registrado.
 */
export interface SubAgentInfo {
  /** name
   * Descrição: Identificador único do agente
   */
  name: string
  /** description
   * Descrição: Texto descritivo do que o agente faz
   */
  description: string
  /** skill
   * Descrição: Nome da skill associada ao agente
   */
  skill: string
  /** tools
   * Descrição: Lista de tools que o agente pode usar
   */
  tools: string[]
  /** level
   * Descrição: Nível do agente (builtin, user, project, session)
   */
  level: SubAgentConfig['level']
}

/** SubAgentManager
 * Descrição: Interface do SubAgent Manager.
 * Centraliza registro, busca e execução de subagentes.
 */
export interface SubAgentManager {
  /** spawn
   * Descrição: Executa um subagente com uma task específica
   * @param config - Configuração do subagente
   * @param task - Task a ser executada
   * @param signal - Signal para cancelamento (opcional)
   * @returns AsyncGenerator que emite SubAgentEvent
   */
  spawn(
    config: SubAgentConfig,
    task: SubAgentTask,
    signal?: AbortSignal,
  ): AsyncGenerator<SubAgentEvent>
  /** list
   * Descrição: Lista todos os subagentes registrados
   * @returns Array de SubAgentInfo
   */
  list(): SubAgentInfo[]
  /** getAgent
   * Descrição: Busca um subagente pelo nome
   * @param name - Nome do subagente
   * @returns SubAgentConfig ou undefined se não encontrado
   */
  getAgent(name: string): SubAgentConfig | undefined
  /** registerAgent
   * Descrição: Registra um novo subagente no manager
   * @param config - Configuração completa do subagente
   */
  registerAgent(config: SubAgentConfig): void
}
