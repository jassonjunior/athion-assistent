/** IndexPipeline
 * Descrição: Pipeline de indexação com estágios nomeados e execução sequencial.
 * Cada estágio recebe e retorna um contexto tipado. Falhas em estágios
 * opcionais (como enriquecimento) não interrompem o pipeline.
 */

import type { Result } from './result'
import { Ok, Err } from './result'

/** PipelineError
 * Descrição: Erro ocorrido durante execução de um estágio do pipeline
 */
export interface PipelineError {
  /** stage
   * Descrição: Nome do estágio que falhou
   */
  stage: string
  /** message
   * Descrição: Mensagem descritiva do erro
   */
  message: string
  /** cause
   * Descrição: Erro original que causou a falha (opcional)
   */
  cause?: Error
}

/** PipelineStage
 * Descrição: Estágio individual do pipeline de indexação
 */
export interface PipelineStage<TContext> {
  /** name
   * Descrição: Nome identificador do estágio
   */
  name: string
  /** optional
   * Descrição: Se true, falha neste estágio não interrompe o pipeline
   */
  optional?: boolean
  /** execute
   * Descrição: Executa o estágio com o contexto atual
   * @param context - Contexto acumulado do pipeline
   * @returns Result com contexto atualizado ou erro
   */
  execute(context: TContext): Promise<Result<TContext, PipelineError>>
  /** shouldSkip
   * Descrição: Verifica se o estágio deve ser pulado
   * @param context - Contexto atual
   * @returns true se o estágio deve ser ignorado
   */
  shouldSkip?(context: TContext): boolean
}

/** StageResult
 * Descrição: Resultado da execução de um estágio individual
 */
export interface StageResult {
  /** name
   * Descrição: Nome do estágio
   */
  name: string
  /** status
   * Descrição: Status da execução (completed, skipped, failed)
   */
  status: 'completed' | 'skipped' | 'failed'
  /** durationMs
   * Descrição: Duração da execução em milissegundos
   */
  durationMs: number
  /** error
   * Descrição: Mensagem de erro se falhou (opcional)
   */
  error?: string
}

/** PipelineResult
 * Descrição: Resultado completo da execução do pipeline
 */
export interface PipelineResult<TContext> {
  /** ok
   * Descrição: true se o pipeline completou sem erros críticos
   */
  ok: boolean
  /** context
   * Descrição: Contexto final após todos os estágios
   */
  context: TContext
  /** stages
   * Descrição: Resultado de cada estágio executado
   */
  stages: StageResult[]
  /** durationMs
   * Descrição: Duração total do pipeline em milissegundos
   */
  durationMs: number
  /** failedStage
   * Descrição: Nome do estágio que causou falha crítica (se houver)
   */
  failedStage?: string
}

/** IndexPipeline
 * Descrição: Executa estágios de indexação em sequência, acumulando contexto.
 * Estágios opcionais podem falhar sem interromper o pipeline.
 */
export class IndexPipeline<TContext> {
  private stages: PipelineStage<TContext>[] = []

  /** addStage
   * Descrição: Adiciona um estágio ao pipeline
   * @param stage - Estágio a adicionar
   * @returns this para encadeamento
   */
  addStage(stage: PipelineStage<TContext>): this {
    this.stages.push(stage)
    return this
  }

  /** run
   * Descrição: Executa todos os estágios em sequência
   * @param context - Contexto inicial
   * @returns Resultado completo do pipeline
   */
  async run(context: TContext): Promise<PipelineResult<TContext>> {
    const pipelineStart = Date.now()
    const stageResults: StageResult[] = []
    let currentContext = context
    let failedStage: string | undefined

    for (const stage of this.stages) {
      const stageStart = Date.now()

      // Check shouldSkip
      if (stage.shouldSkip?.(currentContext)) {
        stageResults.push({
          name: stage.name,
          status: 'skipped',
          durationMs: Date.now() - stageStart,
        })
        continue
      }

      // Execute stage
      try {
        const result = await stage.execute(currentContext)
        const durationMs = Date.now() - stageStart

        if (result.ok) {
          currentContext = result.value
          stageResults.push({ name: stage.name, status: 'completed', durationMs })
        } else {
          if (stage.optional) {
            stageResults.push({
              name: stage.name,
              status: 'failed',
              durationMs,
              error: result.error.message,
            })
          } else {
            stageResults.push({
              name: stage.name,
              status: 'failed',
              durationMs,
              error: result.error.message,
            })
            failedStage = stage.name
            break
          }
        }
      } catch (e) {
        const durationMs = Date.now() - stageStart
        const message = e instanceof Error ? e.message : String(e)

        if (stage.optional) {
          stageResults.push({ name: stage.name, status: 'failed', durationMs, error: message })
        } else {
          stageResults.push({ name: stage.name, status: 'failed', durationMs, error: message })
          failedStage = stage.name
          break
        }
      }
    }

    return {
      ok: !failedStage,
      context: currentContext,
      stages: stageResults,
      durationMs: Date.now() - pipelineStart,
      failedStage,
    }
  }
}

/** createStage
 * Descrição: Helper para criar um PipelineStage com tipos inferidos
 * @param name - Nome do estágio
 * @param execute - Função de execução
 * @param options - Opções adicionais (optional, shouldSkip)
 * @returns PipelineStage configurado
 */
export function createStage<TContext>(
  name: string,
  execute: (context: TContext) => Promise<Result<TContext, PipelineError>>,
  options?: { optional?: boolean; shouldSkip?: (context: TContext) => boolean },
): PipelineStage<TContext> {
  return { name, execute, optional: options?.optional, shouldSkip: options?.shouldSkip }
}

/** stageOk
 * Descrição: Helper para retornar sucesso de um estágio do pipeline
 */
export function stageOk<TContext>(context: TContext): Result<TContext, PipelineError> {
  return Ok(context)
}

/** stageErr
 * Descrição: Helper para retornar erro de um estágio do pipeline
 */
export function stageErr(
  stage: string,
  message: string,
  cause?: Error,
): Result<never, PipelineError> {
  return Err({ stage, message, cause })
}
