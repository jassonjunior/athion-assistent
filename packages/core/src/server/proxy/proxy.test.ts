import { describe, expect, it, vi, beforeEach } from 'vitest'
import { isProxyHealthy, createProxyReuse } from './proxy'

// ── isProxyHealthy ───────────────────────────────────────────────────────────

describe('isProxyHealthy', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('retorna true quando fetch retorna ok', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    const result = await isProxyHealthy(1236)
    expect(result).toBe(true)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'http://localhost:1236/v1/models',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
    globalThis.fetch = originalFetch
  })

  it('retorna true para status 502 (proxy ok, backend down)', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 502 })
    const result = await isProxyHealthy(1236)
    expect(result).toBe(true)
    globalThis.fetch = originalFetch
  })

  it('retorna false para status 404', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    const result = await isProxyHealthy(1236)
    expect(result).toBe(false)
    globalThis.fetch = originalFetch
  })

  it('retorna false quando fetch rejeita (conexao recusada)', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))
    const result = await isProxyHealthy(1236)
    expect(result).toBe(false)
    globalThis.fetch = originalFetch
  })
})

// ── createProxyReuse ─────────────────────────────────────────────────────────

describe('createProxyReuse', () => {
  it('retorna proxy com porta correta', () => {
    const proxy = createProxyReuse(9999)
    expect(proxy.port).toBe(9999)
  })

  it('retorna url correta', () => {
    const proxy = createProxyReuse(9999)
    expect(proxy.url).toBe('http://localhost:9999')
  })

  it('isOwner retorna false', () => {
    const proxy = createProxyReuse(9999)
    expect(proxy.isOwner).toBe(false)
  })

  it('start e stop sao noop (nao lanca erro)', () => {
    const proxy = createProxyReuse(9999)
    expect(() => proxy.start()).not.toThrow()
    expect(() => proxy.stop()).not.toThrow()
  })
})
