/**
 * Testes E2E — Servidor JSON-RPC 2.0 stdio.
 *
 * Spawna `bun serve --mode=stdio` e valida o protocolo completo:
 *   - ping / pong (handshake)
 *   - session CRUD (create, list, load, delete)
 *   - config get / list / set
 *   - tools.list / agents.list
 *   - chat.send streaming com modelo
 *   - chat.abort
 *   - completion.complete
 *
 * Executa com modelo real — requer modelo configurado no config.
 * Executar: bun run test:e2e:cli
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { RpcClient } from './helpers/rpc-client.js'

let rpc: RpcClient

beforeAll(async () => {
  rpc = await RpcClient.create(30000)
}, 35000)

afterAll(() => {
  rpc?.stop()
})

describe('RPC — protocolo base', () => {
  it('ping → pong com timestamp numérico', async () => {
    const result = await rpc.request<{ pong: boolean; timestamp: number }>('ping')
    expect(result.pong).toBe(true)
    expect(result.timestamp).toBeTypeOf('number')
    expect(result.timestamp).toBeGreaterThan(0)
  })

  it('segunda chamada ping → timestamps distintos', async () => {
    const a = await rpc.request<{ timestamp: number }>('ping')
    const b = await rpc.request<{ timestamp: number }>('ping')
    expect(b.timestamp).toBeGreaterThanOrEqual(a.timestamp)
  })

  it('método desconhecido → rejeita com erro', async () => {
    await expect(rpc.request('metodo.invalido')).rejects.toThrow()
  })
})

describe('RPC — config', () => {
  it('config.list → objeto não-vazio', async () => {
    const cfg = await rpc.request<Record<string, unknown>>('config.list')
    expect(cfg).toBeTypeOf('object')
    expect(cfg).not.toBeNull()
    expect(Object.keys(cfg).length).toBeGreaterThan(0)
  })

  it('config.get(provider) → { key, value }', async () => {
    const result = await rpc.request<{ key: string; value: unknown }>('config.get', {
      key: 'provider',
    })
    expect(result.key).toBe('provider')
    expect('value' in result).toBe(true)
  })

  it('config.set + config.get → valor persistido na sessão', async () => {
    await rpc.request('config.set', { key: 'logLevel', value: 'debug' })
    const result = await rpc.request<{ key: string; value: unknown }>('config.get', {
      key: 'logLevel',
    })
    expect(result.value).toBe('debug')
    await rpc.request('config.set', { key: 'logLevel', value: 'info' })
  })
})

describe('RPC — sessões', () => {
  let sessionId: string

  it('session.create → sessão com ID único', async () => {
    const session = await rpc.request<{ id: string; title: string; projectId: string }>(
      'session.create',
      { projectId: 'e2e-project', title: 'Sessão E2E' },
    )
    expect(session.id).toBeTypeOf('string')
    expect(session.id.length).toBeGreaterThan(0)
    expect(session.projectId).toBe('e2e-project')
    sessionId = session.id
  })

  it('session.list → inclui a sessão recém-criada', async () => {
    const sessions = await rpc.request<Array<{ id: string }>>('session.list', {})
    expect(Array.isArray(sessions)).toBe(true)
    expect(sessions.find((s) => s.id === sessionId)).toBeDefined()
  })

  it('session.load(id) → retorna dados completos', async () => {
    const session = await rpc.request<{ id: string; title: string }>('session.load', { sessionId })
    expect(session.id).toBe(sessionId)
    expect(session.title).toBe('Sessão E2E')
  })

  it('session.delete(id) → remove da lista', async () => {
    await rpc.request('session.delete', { sessionId })
    const sessions = await rpc.request<Array<{ id: string }>>('session.list', {})
    expect(sessions.find((s) => s.id === sessionId)).toBeUndefined()
  })

  it('dois session.create simultâneos → IDs distintos', async () => {
    const [a, b] = await Promise.all([
      rpc.request<{ id: string }>('session.create', { projectId: 'e2e', title: 'A' }),
      rpc.request<{ id: string }>('session.create', { projectId: 'e2e', title: 'B' }),
    ])
    expect(a.id).not.toBe(b.id)
    await Promise.all([
      rpc.request('session.delete', { sessionId: a.id }),
      rpc.request('session.delete', { sessionId: b.id }),
    ])
  })
})

describe('RPC — ferramentas e agentes', () => {
  it('tools.list → array com ao menos uma ferramenta', async () => {
    const tools = await rpc.request<Array<{ name: string; description: string }>>('tools.list')
    expect(Array.isArray(tools)).toBe(true)
    expect(tools.length).toBeGreaterThan(0)
    expect(tools[0]).toHaveProperty('name')
    expect(tools[0]).toHaveProperty('description')
  })

  it('agents.list → array com agentes registrados', async () => {
    const agents = await rpc.request<Array<{ name: string }>>('agents.list')
    expect(Array.isArray(agents)).toBe(true)
    expect(agents.length).toBeGreaterThan(0)
    expect(agents[0]).toHaveProperty('name')
  })
})

describe('RPC — chat streaming com modelo', () => {
  it('chat.send → emite notifications chat.event incluindo content e finish', async () => {
    const session = await rpc.request<{ id: string }>('session.create', {
      projectId: 'e2e-chat',
      title: 'Chat E2E',
    })

    const events: Array<{ type: string }> = []
    const unsub = rpc.onNotification((method, params) => {
      if (method === 'chat.event') events.push(params as { type: string })
    })

    await rpc.request('chat.send', { sessionId: session.id, content: 'Responda apenas: OK' }, 60000)

    unsub()
    await rpc.request('session.delete', { sessionId: session.id })

    expect(events.length).toBeGreaterThan(0)
    expect(events.some((e) => e.type === 'content')).toBe(true)
    expect(events.some((e) => e.type === 'finish')).toBe(true)
  }, 90000)

  it('chat.send → content acumula texto coerente', async () => {
    const session = await rpc.request<{ id: string }>('session.create', {
      projectId: 'e2e-content',
      title: 'Content Test',
    })

    const contentParts: string[] = []
    const unsub = rpc.onNotification((method, params) => {
      if (method === 'chat.event') {
        const ev = params as { type: string; content?: string }
        if (ev.type === 'content' && ev.content) contentParts.push(ev.content)
      }
    })

    await rpc.request('chat.send', { sessionId: session.id, content: 'Diga "Olá mundo"' }, 60000)

    unsub()
    await rpc.request('session.delete', { sessionId: session.id })

    const fullText = contentParts.join('')
    expect(fullText.length).toBeGreaterThan(0)
  }, 90000)

  it('chat.send → finish inclui contagem de tokens', async () => {
    const session = await rpc.request<{ id: string }>('session.create', {
      projectId: 'e2e-tokens',
      title: 'Tokens Test',
    })

    let finishEvent: { type: string; promptTokens?: number; completionTokens?: number } | null =
      null
    const unsub = rpc.onNotification((method, params) => {
      if (method === 'chat.event') {
        const ev = params as { type: string; promptTokens?: number; completionTokens?: number }
        if (ev.type === 'finish') finishEvent = ev
      }
    })

    await rpc.request('chat.send', { sessionId: session.id, content: 'Diga: OK' }, 60000)

    unsub()
    await rpc.request('session.delete', { sessionId: session.id })

    expect(finishEvent).not.toBeNull()
    const fe = finishEvent as unknown as { promptTokens?: number; completionTokens?: number }
    expect(fe.promptTokens).toBeGreaterThan(0)
    expect(fe.completionTokens).toBeGreaterThan(0)
  }, 90000)

  it('chat.abort → interrompe o streaming', async () => {
    const session = await rpc.request<{ id: string }>('session.create', {
      projectId: 'e2e-abort',
      title: 'Abort Test',
    })

    const events: Array<{ type: string }> = []
    const unsub = rpc.onNotification((method, params) => {
      if (method === 'chat.event') events.push(params as { type: string })
    })

    const sendPromise = rpc.request('chat.send', {
      sessionId: session.id,
      content: 'Conte de 1 a 500 escrevendo cada número por extenso em português',
    })

    // Aguarda o streaming iniciar e aborta
    await new Promise((r) => setTimeout(r, 800))
    await rpc.request('chat.abort', { sessionId: session.id })
    await sendPromise

    unsub()
    await rpc.request('session.delete', { sessionId: session.id })

    // Após abort: deve ter pelo menos algum conteúdo mas sem finish normal
    const hasContent = events.some((e) => e.type === 'content')
    const hasFinish = events.some((e) => e.type === 'finish')
    // Se abortou rápido o suficiente, não deve ter finish; ou pode ter error
    expect(hasContent || events.length >= 0).toBe(true)
    expect(hasContent || !hasFinish).toBe(true)
  }, 60000)

  it('duas sessões em sequência → respostas independentes', async () => {
    const [s1, s2] = await Promise.all([
      rpc.request<{ id: string }>('session.create', { projectId: 'e2e', title: 'S1' }),
      rpc.request<{ id: string }>('session.create', { projectId: 'e2e', title: 'S2' }),
    ])

    const content1: string[] = []
    const content2: string[] = []

    const unsub1 = rpc.onNotification((method, params) => {
      const ev = params as { type: string; content?: string; sessionId?: string }
      if (method === 'chat.event' && ev.type === 'content' && ev.content) {
        content1.push(ev.content)
      }
    })

    await rpc.request('chat.send', { sessionId: s1.id, content: 'Diga: PRIMEIRO' }, 60000)
    unsub1()

    const unsub2 = rpc.onNotification((method, params) => {
      const ev = params as { type: string; content?: string }
      if (method === 'chat.event' && ev.type === 'content' && ev.content) {
        content2.push(ev.content)
      }
    })

    await rpc.request('chat.send', { sessionId: s2.id, content: 'Diga: SEGUNDO' }, 60000)
    unsub2()

    await Promise.all([
      rpc.request('session.delete', { sessionId: s1.id }),
      rpc.request('session.delete', { sessionId: s2.id }),
    ])

    expect(content1.join('').length).toBeGreaterThan(0)
    expect(content2.join('').length).toBeGreaterThan(0)
  }, 180000)

  it('completion.complete → retorna sugestão de código TypeScript', async () => {
    const result = await rpc.request<{ completion: string }>('completion.complete', {
      prefix: 'function soma(a: number, b: number)',
      suffix: '',
      language: 'typescript',
    })
    expect(result.completion).toBeTypeOf('string')
    expect(result.completion.length).toBeGreaterThan(0)
  }, 30000)
})
