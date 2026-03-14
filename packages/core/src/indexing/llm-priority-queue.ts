/** LlmPriorityQueue
 * Descrição: Fila de prioridade para compartilhamento de LLM entre enrichment
 * e inference do agente. O agente tem prioridade — quando está ativo,
 * chamadas de enrichment são enfileiradas e executadas quando o agente para.
 */

/** LlmPriorityQueue
 * Descrição: Gerencia concorrência entre enrichment (background) e inference (foreground).
 * Quando o agente está fazendo inference, enrichment é pausado.
 * Quando o agente termina, a fila de enrichment é drenada.
 */
export class LlmPriorityQueue {
  private agentActive = false
  private queue: Array<{ resolve: () => void }> = []

  /** agentStart
   * Descrição: Sinaliza que o agente iniciou inference — pausa enrichment
   */
  agentStart(): void {
    this.agentActive = true
  }

  /** agentEnd
   * Descrição: Sinaliza que o agente terminou inference — drena fila de enrichment
   */
  agentEnd(): void {
    this.agentActive = false
    this.drainQueue()
  }

  /** isAgentActive
   * Descrição: Verifica se o agente está fazendo inference
   */
  isAgentActive(): boolean {
    return this.agentActive
  }

  /** enqueueEnrichment
   * Descrição: Enfileira uma tarefa de enrichment. Se o agente não está ativo,
   * executa imediatamente. Se está ativo, espera até o agente terminar.
   * @param task - Função assíncrona a executar
   * @returns Resultado da tarefa
   */
  async enqueueEnrichment<T>(task: () => Promise<T>): Promise<T> {
    if (this.agentActive) {
      await this.waitForAgent()
    }
    return task()
  }

  /** pendingCount
   * Descrição: Número de tarefas de enrichment aguardando na fila
   */
  get pendingCount(): number {
    return this.queue.length
  }

  /** waitForAgent
   * Descrição: Retorna uma promise que resolve quando o agente terminar
   */
  private waitForAgent(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push({ resolve })
    })
  }

  /** drainQueue
   * Descrição: Libera todas as tarefas enfileiradas
   */
  private drainQueue(): void {
    const pending = this.queue.splice(0)
    for (const item of pending) {
      item.resolve()
    }
  }
}
