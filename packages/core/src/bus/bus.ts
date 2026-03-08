import type { z, ZodType } from 'zod/v4'

/**
 * Definição de um evento do bus.
 * Cada evento tem um tipo (string única) e um schema Zod para validar o payload.
 * @template T - Schema Zod que define a forma dos dados do evento
 */
export interface BusEventDef<T extends ZodType> {
  /** Identificador único do evento (ex: 'stream.content', 'config.changed') */
  type: string
  /** Schema Zod que valida os dados enviados com o evento */
  schema: T
}

/**
 * Factory function para criar definições de eventos tipadas.
 * Garante que o tipo e o schema ficam vinculados em tempo de compilação.
 * @param type - Identificador único do evento
 * @param schema - Schema Zod para validação do payload
 * @returns Definição de evento tipada
 * @example
 * const UserLoggedIn = defineBusEvent('user.logged_in', z.object({
 *   userId: z.string(),
 *   timestamp: z.number(),
 * }))
 */
export function defineBusEvent<T extends ZodType>(type: string, schema: T): BusEventDef<T> {
  return { type, schema }
}

/**
 * Interface pública do Event Bus.
 * Sistema pub/sub tipado com validação Zod em runtime.
 */
export interface Bus {
  /**
   * Publica um evento no bus, notificando todos os subscribers.
   * Os dados são validados pelo schema Zod antes de serem entregues.
   * @param event - Definição do evento a ser publicado
   * @param data - Dados do evento (devem passar na validação do schema)
   * @throws {ZodError} Se os dados não passarem na validação
   */
  publish<T extends ZodType>(event: BusEventDef<T>, data: z.infer<T>): void

  /**
   * Registra um handler que será chamado toda vez que o evento for publicado.
   * @param event - Definição do evento a escutar
   * @param handler - Função chamada com os dados validados
   * @returns Função de unsubscribe — chame para parar de receber o evento
   */
  subscribe<T extends ZodType>(
    event: BusEventDef<T>,
    handler: (data: z.infer<T>) => void,
  ): () => void

  /**
   * Registra um handler que será chamado apenas UMA vez.
   * Após receber o primeiro evento, o handler é removido automaticamente.
   * @param event - Definição do evento a escutar
   * @param handler - Função chamada com os dados validados (1 vez só)
   * @returns Função de unsubscribe — chame para cancelar antes de receber
   */
  once<T extends ZodType>(event: BusEventDef<T>, handler: (data: z.infer<T>) => void): () => void

  /**
   * Remove todos os subscribers de todos os eventos.
   * Útil para limpeza em testes ou ao encerrar a aplicação.
   */
  clear(): void
}

/**
 * Cria uma nova instância do Event Bus.
 * Cada instância tem seu próprio conjunto de subscribers isolado.
 * @returns Instância do Bus pronta para uso
 * @example
 * const bus = createBus()
 * const unsub = bus.subscribe(StreamContent, (data) => {
 *   console.log(data.content)
 * })
 * bus.publish(StreamContent, { sessionId: '123', content: 'Hello', index: 0 })
 * unsub() // para de receber
 */
export function createBus(): Bus {
  const handlers = new Map<string, Set<(data: unknown) => void>>()

  function getHandlers(type: string): Set<(data: unknown) => void> {
    let set = handlers.get(type)
    if (!set) {
      set = new Set()
      handlers.set(type, set)
    }
    return set
  }

  /**
   * Publica um evento no bus, notificando todos os subscribers.
   * Os dados são validados pelo schema Zod antes de serem entregues.
   * @param event - Definição do evento a ser publicado
   * @param data - Dados do evento (devem passar na validação do schema)
   * @throws {ZodError} Se os dados não passarem na validação
   */
  function publish<T extends ZodType>(event: BusEventDef<T>, data: z.infer<T>): void {
    const validated = event.schema.parse(data)
    const set = handlers.get(event.type)
    if (!set) return
    for (const handler of set) {
      handler(validated)
    }
  }

  /**
   * Registra um handler que será chamado toda vez que o evento for publicado.
   * @param event - Definição do evento a escutar
   * @param handler - Função chamada com os dados validados
   * @returns Função de unsubscribe — chame para parar de receber o evento
   */
  function subscribe<T extends ZodType>(
    event: BusEventDef<T>,
    handler: (data: z.infer<T>) => void,
  ): () => void {
    const set = getHandlers(event.type)
    set.add(handler as (data: unknown) => void)
    return () => set.delete(handler as (data: unknown) => void)
  }

  /**
   * Registra um handler que será chamado apenas UMA vez.
   * Após receber o primeiro evento, o handler é removido automaticamente.
   * @param event - Definição do evento a escutar
   * @param handler - Função chamada com os dados validados (1 vez só)
   * @returns Função de unsubscribe — chame para cancelar antes de receber
   */
  function once<T extends ZodType>(
    event: BusEventDef<T>,
    handler: (data: z.infer<T>) => void,
  ): () => void {
    const wrapper = (data: z.infer<T>) => {
      unsubscribe()
      handler(data)
    }
    const unsubscribe = subscribe(event, wrapper)
    return unsubscribe
  }

  /**
   * Remove todos os subscribers de todos os eventos.
   * Útil para limpeza em testes ou ao encerrar a aplicação.
   */
  function clear(): void {
    handlers.clear()
  }

  return { publish, subscribe, once, clear }
}
