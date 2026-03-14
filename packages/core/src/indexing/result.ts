/** Result<T, E>
 * Descrição: Tipo para error handling explícito sem exceções.
 * Inspirado em Rust Result — força o chamador a lidar com sucesso e erro.
 * Disponibilizado na Fase 0 para uso nos novos componentes das Fases 1-5.
 */

/** Result
 * Descrição: Union type que representa sucesso (ok: true, value: T) ou
 * erro (ok: false, error: E). Substitui try/catch com tipagem forte.
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E }

/** Ok
 * Descrição: Cria um Result de sucesso contendo o valor fornecido
 * @param value - Valor de sucesso
 * @returns Result com ok: true e o valor
 */
export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value })

/** Err
 * Descrição: Cria um Result de erro contendo o erro fornecido
 * @param error - Objeto de erro
 * @returns Result com ok: false e o erro
 */
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error })

/** unwrapOr
 * Descrição: Extrai o valor de um Result ou retorna o fallback em caso de erro
 * @param result - Result a desempacotar
 * @param fallback - Valor padrão se o Result for erro
 * @returns O valor do Result ou o fallback
 */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback
}

/** mapResult
 * Descrição: Transforma o valor de um Result de sucesso, propagando erros
 * @param result - Result a transformar
 * @param fn - Função de transformação aplicada ao valor de sucesso
 * @returns Novo Result com o valor transformado ou o erro original
 */
export function mapResult<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? Ok(fn(result.value)) : result
}

/** flatMapResult
 * Descrição: Encadeia operações que retornam Result, propagando erros
 * @param result - Result a encadear
 * @param fn - Função que recebe o valor e retorna um novo Result
 * @returns Result da função encadeada ou o erro original
 */
export function flatMapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  return result.ok ? fn(result.value) : result
}

/** tryCatch
 * Descrição: Envolve uma função síncrona em um Result, capturando exceções
 * @param fn - Função síncrona a executar
 * @returns Result de sucesso com o retorno ou erro com a exceção capturada
 */
export function tryCatch<T>(fn: () => T): Result<T, Error> {
  try {
    return Ok(fn())
  } catch (e) {
    return Err(e instanceof Error ? e : new Error(String(e)))
  }
}

/** tryCatchAsync
 * Descrição: Envolve uma função assíncrona em um Result, capturando exceções
 * @param fn - Função assíncrona a executar
 * @returns Promise de Result de sucesso com o retorno ou erro com a exceção capturada
 */
export async function tryCatchAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return Ok(await fn())
  } catch (e) {
    return Err(e instanceof Error ? e : new Error(String(e)))
  }
}
