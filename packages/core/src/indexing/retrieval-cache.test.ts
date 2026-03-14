import { describe, expect, it, vi } from 'vitest'
import { RetrievalCache } from './retrieval-cache'

describe('RetrievalCache', () => {
  it('set e get funcionam para cache hit', () => {
    const cache = new RetrievalCache<string>()
    cache.set('key1', 'value1')
    expect(cache.get('key1')).toBe('value1')
  })

  it('retorna undefined para cache miss', () => {
    const cache = new RetrievalCache<string>()
    expect(cache.get('inexistente')).toBeUndefined()
  })

  it('LRU evicts entry mais antiga quando excede maxSize', () => {
    const cache = new RetrievalCache<number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)
    cache.set('d', 4) // Evicts 'a' (mais antiga)

    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toBe(2)
    expect(cache.get('d')).toBe(4)
    expect(cache.size).toBe(3)
  })

  it('TTL expira entries após ttlMs', () => {
    vi.useFakeTimers()
    const cache = new RetrievalCache<string>(100, 1000) // 1s TTL

    cache.set('key', 'value')
    expect(cache.get('key')).toBe('value')

    vi.advanceTimersByTime(1001) // Passa 1s
    expect(cache.get('key')).toBeUndefined()

    vi.useRealTimers()
  })

  it('access atualiza LRU order (não evicts entry recém acessada)', () => {
    const cache = new RetrievalCache<number>(3)
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)

    // Acessa 'a' — move para final
    cache.get('a')

    // Insere 'd' — evicts 'b' (agora é a mais antiga)
    cache.set('d', 4)

    expect(cache.get('a')).toBe(1) // Sobreviveu
    expect(cache.get('b')).toBeUndefined() // Evicted
    expect(cache.get('d')).toBe(4)
  })

  it('invalidate sem pattern limpa todo o cache', () => {
    const cache = new RetrievalCache<number>()
    cache.set('a', 1)
    cache.set('b', 2)
    cache.set('c', 3)

    cache.invalidate()
    expect(cache.size).toBe(0)
    expect(cache.get('a')).toBeUndefined()
  })

  it('invalidate com pattern remove apenas entries que contêm o pattern', () => {
    const cache = new RetrievalCache<number>()
    cache.set('search:auth', 1)
    cache.set('search:db', 2)
    cache.set('context:auth', 3)

    cache.invalidate('search:')

    expect(cache.get('search:auth')).toBeUndefined()
    expect(cache.get('search:db')).toBeUndefined()
    expect(cache.get('context:auth')).toBe(3)
    expect(cache.size).toBe(1)
  })

  it('set sobrescreve entry existente', () => {
    const cache = new RetrievalCache<string>()
    cache.set('key', 'old')
    cache.set('key', 'new')
    expect(cache.get('key')).toBe('new')
    expect(cache.size).toBe(1)
  })

  it('size retorna número correto de entries', () => {
    const cache = new RetrievalCache<number>()
    expect(cache.size).toBe(0)
    cache.set('a', 1)
    expect(cache.size).toBe(1)
    cache.set('b', 2)
    expect(cache.size).toBe(2)
  })
})
