import { describe, expect, it } from 'vitest'
import { Err, Ok, flatMapResult, mapResult, tryCatch, tryCatchAsync, unwrapOr } from './result'

describe('Result<T, E>', () => {
  describe('Ok', () => {
    it('cria Result de sucesso com ok: true', () => {
      const result = Ok(42)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe(42)
    })

    it('funciona com tipos complexos', () => {
      const result = Ok({ name: 'test', items: [1, 2, 3] })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value.name).toBe('test')
        expect(result.value.items).toEqual([1, 2, 3])
      }
    })
  })

  describe('Err', () => {
    it('cria Result de erro com ok: false', () => {
      const result = Err(new Error('falha'))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toBe('falha')
    })

    it('funciona com tipos de erro customizados', () => {
      const result = Err({ code: 'NOT_FOUND', message: 'item não existe' })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('NOT_FOUND')
    })
  })

  describe('unwrapOr', () => {
    it('retorna value quando Result é Ok', () => {
      expect(unwrapOr(Ok(10), 0)).toBe(10)
    })

    it('retorna fallback quando Result é Err', () => {
      expect(unwrapOr(Err(new Error('x')), 0)).toBe(0)
    })
  })

  describe('mapResult', () => {
    it('transforma valor de Ok', () => {
      const result = mapResult(Ok(5), (n) => n * 2)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe(10)
    })

    it('propaga Err sem chamar fn', () => {
      const error = new Error('boom')
      const result = mapResult(Err(error), () => 'never')
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toBe(error)
    })
  })

  describe('flatMapResult', () => {
    it('encadeia operações que retornam Result', () => {
      const divide = (a: number, b: number) => (b === 0 ? Err(new Error('div by zero')) : Ok(a / b))

      const result = flatMapResult(Ok(10), (n) => divide(n, 2))
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe(5)
    })

    it('propaga erro da primeira operação', () => {
      const result = flatMapResult(Err(new Error('first')), () => Ok(42))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toBe('first')
    })

    it('propaga erro da segunda operação', () => {
      const result = flatMapResult(Ok(10), () => Err(new Error('second')))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toBe('second')
    })
  })

  describe('tryCatch', () => {
    it('retorna Ok para função que não lança', () => {
      const result = tryCatch(() => 42)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe(42)
    })

    it('retorna Err para função que lança Error', () => {
      const result = tryCatch(() => {
        throw new Error('boom')
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toBe('boom')
    })

    it('converte exceção não-Error em Error', () => {
      const result = tryCatch(() => {
        throw 'string error'
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toBe('string error')
    })
  })

  describe('tryCatchAsync', () => {
    it('retorna Ok para async que resolve', async () => {
      const result = await tryCatchAsync(async () => 42)
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toBe(42)
    })

    it('retorna Err para async que rejeita', async () => {
      const result = await tryCatchAsync(async () => {
        throw new Error('async boom')
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.message).toBe('async boom')
    })
  })
})
