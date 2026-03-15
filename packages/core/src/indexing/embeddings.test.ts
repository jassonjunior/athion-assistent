/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  createEmbeddingService,
  cosineSimilarity,
  serializeVector,
  deserializeVector,
} from './embeddings'

describe('cosineSimilarity', () => {
  it('retorna 1 para vetores idênticos', () => {
    const v = [1, 2, 3]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5)
  })

  it('retorna 0 para vetores ortogonais', () => {
    const a = [1, 0]
    const b = [0, 1]
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5)
  })

  it('retorna -1 para vetores opostos', () => {
    const a = [1, 0]
    const b = [-1, 0]
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5)
  })

  it('retorna 0 para vetores de tamanhos diferentes', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
  })

  it('retorna 0 para vetores vazios', () => {
    expect(cosineSimilarity([], [])).toBe(0)
  })

  it('retorna 0 para vetor zero', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
  })

  it('calcula corretamente para vetores genéricos', () => {
    const a = [1, 2, 3]
    const b = [4, 5, 6]
    // dot = 4+10+18 = 32, |a| = sqrt(14), |b| = sqrt(77)
    const expected = 32 / (Math.sqrt(14) * Math.sqrt(77))
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 5)
  })
})

describe('serializeVector / deserializeVector', () => {
  it('serializa e desserializa vetor corretamente (roundtrip)', () => {
    const vec = [1.5, -2.3, 0.0, 100.123, -0.001]
    const buf = serializeVector(vec)
    const result = deserializeVector(buf)
    expect(result).toHaveLength(vec.length)
    for (let i = 0; i < vec.length; i++) {
      expect(result[i]).toBeCloseTo(vec[i]!, 3)
    }
  })

  it('serializa vetor vazio', () => {
    const buf = serializeVector([])
    expect(buf.byteLength).toBe(0)
    const result = deserializeVector(buf)
    expect(result).toEqual([])
  })

  it('buffer tem tamanho correto (4 bytes por float)', () => {
    const vec = [1, 2, 3, 4, 5]
    const buf = serializeVector(vec)
    expect(buf.byteLength).toBe(20) // 5 * 4
  })

  it('suporta Uint8Array na desserialização', () => {
    const vec = [1.0, 2.0, 3.0]
    const buf = serializeVector(vec)
    const uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    const result = deserializeVector(uint8)
    expect(result).toHaveLength(3)
    expect(result[0]).toBeCloseTo(1.0, 3)
    expect(result[1]).toBeCloseTo(2.0, 3)
    expect(result[2]).toBeCloseTo(3.0, 3)
  })

  it('preserva valores negativos', () => {
    const vec = [-1.5, -100, -0.001]
    const buf = serializeVector(vec)
    const result = deserializeVector(buf)
    for (let i = 0; i < vec.length; i++) {
      expect(result[i]).toBeCloseTo(vec[i]!, 3)
    }
  })
})

describe('createEmbeddingService', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('getDimensions retorna 0 inicialmente se não configurado', () => {
    const service = createEmbeddingService({
      baseUrl: 'http://localhost:1234',
      model: 'test-model',
    })
    expect(service.getDimensions()).toBe(0)
  })

  it('getDimensions retorna valor configurado', () => {
    const service = createEmbeddingService({
      baseUrl: 'http://localhost:1234',
      model: 'test-model',
      dimensions: 384,
    })
    expect(service.getDimensions()).toBe(384)
  })

  it('embedBatch retorna array vazio para input vazio', async () => {
    const service = createEmbeddingService({
      baseUrl: 'http://localhost:1234',
      model: 'test-model',
    })
    const result = await service.embedBatch([])
    expect(result).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('embedBatch chama API corretamente e retorna vetores', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { index: 0, embedding: [0.1, 0.2, 0.3] },
            { index: 1, embedding: [0.4, 0.5, 0.6] },
          ],
        }),
    })

    const service = createEmbeddingService({
      baseUrl: 'http://localhost:1234',
      model: 'test-model',
    })
    const result = await service.embedBatch(['hello', 'world'])

    expect(result).toEqual([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ])
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:1234/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ model: 'test-model', input: ['hello', 'world'] }),
      }),
    )
  })

  it('embedBatch ordena por index da resposta', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [
            { index: 1, embedding: [0.4, 0.5] },
            { index: 0, embedding: [0.1, 0.2] },
          ],
        }),
    })

    const service = createEmbeddingService({
      baseUrl: 'http://localhost:1234',
      model: 'test-model',
    })
    const result = await service.embedBatch(['first', 'second'])
    expect(result).toEqual([
      [0.1, 0.2],
      [0.4, 0.5],
    ])
  })

  it('embedBatch atualiza dimensions na primeira chamada', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ index: 0, embedding: [0.1, 0.2, 0.3, 0.4] }],
        }),
    })

    const service = createEmbeddingService({
      baseUrl: 'http://localhost:1234',
      model: 'test-model',
    })
    expect(service.getDimensions()).toBe(0)
    await service.embedBatch(['test'])
    expect(service.getDimensions()).toBe(4)
  })

  it('embedBatch retorna null quando API retorna erro HTTP', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500 })

    const service = createEmbeddingService({
      baseUrl: 'http://localhost:1234',
      model: 'test-model',
    })
    const result = await service.embedBatch(['test'])
    expect(result).toBeNull()
  })

  it('embedBatch retorna null em caso de exceção (rede)', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'))

    const service = createEmbeddingService({
      baseUrl: 'http://localhost:1234',
      model: 'test-model',
    })
    const result = await service.embedBatch(['test'])
    expect(result).toBeNull()
  })

  it('embed retorna vetor único', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ index: 0, embedding: [0.1, 0.2, 0.3] }],
        }),
    })

    const service = createEmbeddingService({
      baseUrl: 'http://localhost:1234',
      model: 'test-model',
    })
    const result = await service.embed('hello')
    expect(result).toEqual([0.1, 0.2, 0.3])
  })

  it('embed retorna null quando API falha', async () => {
    fetchSpy.mockResolvedValue({ ok: false, status: 500 })

    const service = createEmbeddingService({
      baseUrl: 'http://localhost:1234',
      model: 'test-model',
    })
    const result = await service.embed('hello')
    expect(result).toBeNull()
  })

  it('inclui Authorization header quando apiKey fornecida', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ index: 0, embedding: [0.1] }],
        }),
    })

    const service = createEmbeddingService({
      baseUrl: 'http://localhost:1234',
      model: 'test-model',
      apiKey: 'sk-test-key',
    })
    await service.embedBatch(['test'])

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-test-key',
        }),
      }),
    )
  })

  it('não inclui Authorization header sem apiKey', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: [{ index: 0, embedding: [0.1] }],
        }),
    })

    const service = createEmbeddingService({
      baseUrl: 'http://localhost:1234',
      model: 'test-model',
    })
    await service.embedBatch(['test'])

    const callArgs = fetchSpy.mock.calls[0]
    const headers = callArgs[1].headers as Record<string, string>
    expect(headers['Authorization']).toBeUndefined()
  })
})
