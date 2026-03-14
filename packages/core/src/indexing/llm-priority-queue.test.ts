import { describe, expect, it } from 'vitest'
import { LlmPriorityQueue } from './llm-priority-queue'

describe('LlmPriorityQueue', () => {
  it('executa enrichment imediatamente quando agente inativo', async () => {
    const queue = new LlmPriorityQueue()
    const result = await queue.enqueueEnrichment(async () => 42)
    expect(result).toBe(42)
  })

  it('pausa enrichment quando agente está ativo', async () => {
    const queue = new LlmPriorityQueue()
    queue.agentStart()

    let resolved = false
    const promise = queue.enqueueEnrichment(async () => {
      resolved = true
      return 'done'
    })

    // Enrichment não executou ainda
    await new Promise((r) => setTimeout(r, 10))
    expect(resolved).toBe(false)
    expect(queue.pendingCount).toBe(1)

    // Agente termina → enrichment retoma
    queue.agentEnd()
    const result = await promise
    expect(result).toBe('done')
    expect(resolved).toBe(true)
    expect(queue.pendingCount).toBe(0)
  })

  it('isAgentActive reflete estado corretamente', () => {
    const queue = new LlmPriorityQueue()
    expect(queue.isAgentActive()).toBe(false)

    queue.agentStart()
    expect(queue.isAgentActive()).toBe(true)

    queue.agentEnd()
    expect(queue.isAgentActive()).toBe(false)
  })

  it('drena múltiplas tarefas quando agente termina', async () => {
    const queue = new LlmPriorityQueue()
    queue.agentStart()

    const results: number[] = []
    const p1 = queue.enqueueEnrichment(async () => {
      results.push(1)
      return 1
    })
    const p2 = queue.enqueueEnrichment(async () => {
      results.push(2)
      return 2
    })
    const p3 = queue.enqueueEnrichment(async () => {
      results.push(3)
      return 3
    })

    expect(queue.pendingCount).toBe(3)

    queue.agentEnd()
    await Promise.all([p1, p2, p3])

    expect(results).toEqual([1, 2, 3])
    expect(queue.pendingCount).toBe(0)
  })
})
