import { describe, expect, it } from 'vitest'
import { IndexPipeline, createStage, stageOk, stageErr } from './pipeline'

interface TestContext {
  value: number
  log: string[]
}

describe('IndexPipeline', () => {
  it('executa estágios em ordem', async () => {
    const pipeline = new IndexPipeline<TestContext>()
      .addStage(
        createStage('double', async (ctx) =>
          stageOk({ ...ctx, value: ctx.value * 2, log: [...ctx.log, 'double'] }),
        ),
      )
      .addStage(
        createStage('add10', async (ctx) =>
          stageOk({ ...ctx, value: ctx.value + 10, log: [...ctx.log, 'add10'] }),
        ),
      )

    const result = await pipeline.run({ value: 5, log: [] })
    expect(result.ok).toBe(true)
    expect(result.context.value).toBe(20) // (5 * 2) + 10
    expect(result.context.log).toEqual(['double', 'add10'])
    expect(result.stages).toHaveLength(2)
    expect(result.stages[0]?.status).toBe('completed')
    expect(result.stages[1]?.status).toBe('completed')
  })

  it('para em estágio obrigatório que falha', async () => {
    const pipeline = new IndexPipeline<TestContext>()
      .addStage(createStage('ok-stage', async (ctx) => stageOk(ctx)))
      .addStage(createStage('fail-stage', async () => stageErr('fail-stage', 'something broke')))
      .addStage(createStage('never-reached', async (ctx) => stageOk(ctx)))

    const result = await pipeline.run({ value: 1, log: [] })
    expect(result.ok).toBe(false)
    expect(result.failedStage).toBe('fail-stage')
    expect(result.stages).toHaveLength(2) // ok + fail, never-reached não executou
  })

  it('continua quando estágio opcional falha', async () => {
    const pipeline = new IndexPipeline<TestContext>()
      .addStage(createStage('first', async (ctx) => stageOk({ ...ctx, value: ctx.value + 1 })))
      .addStage(
        createStage('optional-fail', async () => stageErr('optional-fail', 'enrichment failed'), {
          optional: true,
        }),
      )
      .addStage(createStage('last', async (ctx) => stageOk({ ...ctx, value: ctx.value + 1 })))

    const result = await pipeline.run({ value: 0, log: [] })
    expect(result.ok).toBe(true)
    expect(result.context.value).toBe(2) // first (+1) + last (+1)
    expect(result.stages).toHaveLength(3)
    expect(result.stages[1]?.status).toBe('failed')
    expect(result.stages[1]?.error).toBe('enrichment failed')
    expect(result.stages[2]?.status).toBe('completed')
  })

  it('pula estágio com shouldSkip', async () => {
    const pipeline = new IndexPipeline<TestContext>()
      .addStage(
        createStage('skippable', async (ctx) => stageOk({ ...ctx, value: 999 }), {
          shouldSkip: (ctx) => ctx.value === 0,
        }),
      )
      .addStage(createStage('always', async (ctx) => stageOk({ ...ctx, value: ctx.value + 1 })))

    const result = await pipeline.run({ value: 0, log: [] })
    expect(result.ok).toBe(true)
    expect(result.context.value).toBe(1) // skippable pulado, always +1
    expect(result.stages[0]?.status).toBe('skipped')
  })

  it('captura exceção como falha de estágio', async () => {
    const pipeline = new IndexPipeline<TestContext>().addStage(
      createStage('throws', async () => {
        throw new Error('unexpected crash')
      }),
    )

    const result = await pipeline.run({ value: 0, log: [] })
    expect(result.ok).toBe(false)
    expect(result.failedStage).toBe('throws')
    expect(result.stages[0]?.error).toBe('unexpected crash')
  })

  it('exceção em estágio opcional não interrompe', async () => {
    const pipeline = new IndexPipeline<TestContext>()
      .addStage(
        createStage(
          'throws-optional',
          async () => {
            throw new Error('crash')
          },
          { optional: true },
        ),
      )
      .addStage(createStage('after', async (ctx) => stageOk({ ...ctx, value: 42 })))

    const result = await pipeline.run({ value: 0, log: [] })
    expect(result.ok).toBe(true)
    expect(result.context.value).toBe(42)
  })

  it('registra durationMs por estágio', async () => {
    const pipeline = new IndexPipeline<TestContext>().addStage(
      createStage('timed', async (ctx) => stageOk(ctx)),
    )

    const result = await pipeline.run({ value: 0, log: [] })
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.stages[0]?.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('pipeline vazio retorna ok', async () => {
    const pipeline = new IndexPipeline<TestContext>()
    const result = await pipeline.run({ value: 5, log: [] })
    expect(result.ok).toBe(true)
    expect(result.context.value).toBe(5)
    expect(result.stages).toHaveLength(0)
  })
})
