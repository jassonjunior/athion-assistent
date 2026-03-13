import type { z, ZodType } from 'zod/v4'

/** BusEventDef
 * Descrição: Definição de um evento do bus. Cada evento tem um tipo (string única)
 * e um schema Zod para validar o payload.
 * @template T - Schema Zod que define a forma dos dados do evento
 */
export interface BusEventDef<T extends ZodType> {
  /** Identificador único do evento (ex: 'stream.content', 'config.changed') */
  type: string
  /** Schema Zod que valida os dados enviados com o evento */
  schema: T
}

/** defineBusEvent
 * Descrição: Cria uma definição de evento tipada para o bus.
 * Garante que o tipo e o schema ficam vinculados em tempo de compilação.
 * @param type - Identificador único do evento
 * @param schema - Schema Zod para validação do payload
 * @returns Definição de evento tipada
 */
export function defineBusEvent<T extends ZodType>(type: string, schema: T): BusEventDef<T> {
  return { type, schema }
}

/** Bus
 * Descrição: Interface pública do Event Bus.
 * Sistema pub/sub tipado com validação Zod em runtime.
 */
export interface Bus {
  /** publish
   * Descrição: Publica um evento no bus, notificando todos os subscribers.
   * Os dados são validados pelo schema Zod antes de serem entregues.
   * @param event - Definição do evento a ser publicado
   * @param data - Dados do evento (devem passar na validação do schema)
   */
  publish<T extends ZodType>(event: BusEventDef<T>, data: z.infer<T>): void

  /** subscribe
   * Descrição: Registra um handler que será chamado toda vez que o evento for publicado.
   * @param event - Definição do evento a escutar
   * @param handler - Função chamada com os dados validados
   * @returns Função de unsubscribe para parar de receber o evento
   */
  subscribe<T extends ZodType>(
    event: BusEventDef<T>,
    handler: (data: z.infer<T>) => void,
  ): () => void

  /** once
   * Descrição: Registra um handler que será chamado apenas uma vez.
   * Após receber o primeiro evento, o handler é removido automaticamente.
   * @param event - Definição do evento a escutar
   * @param handler - Função chamada com os dados validados (1 vez só)
   * @returns Função de unsubscribe para cancelar antes de receber
   */
  once<T extends ZodType>(event: BusEventDef<T>, handler: (data: z.infer<T>) => void): () => void

  /** clear
   * Descrição: Remove todos os subscribers de todos os eventos.
   * Útil para limpeza em testes ou ao encerrar a aplicação.
   */
  clear(): void
}

/** createBus
 * Descrição: Cria uma nova instância do Event Bus com subscribers isolados.
 * @returns Instância do Bus pronta para uso
 */
export function createBus(): Bus {
  const handlers = new Map<string, Set<(data: unknown) => void>>()

  /** getHandlers
   * Descrição: Retorna o Set de handlers para um tipo de evento, criando se não existir.
   * @param type - Identificador do tipo de evento
   * @returns Set de handlers registrados
   */
  function getHandlers(type: string): Set<(data: unknown) => void> {
    let set = handlers.get(type)
    if (!set) {
      set = new Set()
      handlers.set(type, set)
    }
    return set
  }

  /** publish
   * Descrição: Publica um evento no bus, notificando todos os subscribers.
   * Os dados são validados pelo schema Zod antes de serem entregues.
   * @param event - Definição do evento a ser publicado
   * @param data - Dados do evento (devem passar na validação do schema)
   */
  function publish<T extends ZodType>(event: BusEventDef<T>, data: z.infer<T>): void {
    const validated = event.schema.parse(data)
    const set = handlers.get(event.type)
    if (!set) return
    for (const handler of set) {
      handler(validated)
    }
  }

  /** subscribe
   * Descrição: Registra um handler que será chamado toda vez que o evento for publicado.
   * @param event - Definição do evento a escutar
   * @param handler - Função chamada com os dados validados
   * @returns Função de unsubscribe para parar de receber o evento
   */
  function subscribe<T extends ZodType>(
    event: BusEventDef<T>,
    handler: (data: z.infer<T>) => void,
  ): () => void {
    const set = getHandlers(event.type)
    set.add(handler as (data: unknown) => void)
    return () => set.delete(handler as (data: unknown) => void)
  }

  /** once
   * Descrição: Registra um handler que será chamado apenas uma vez.
   * Após receber o primeiro evento, o handler é removido automaticamente.
   * @param event - Definição do evento a escutar
   * @param handler - Função chamada com os dados validados (1 vez só)
   * @returns Função de unsubscribe para cancelar antes de receber
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

  /** clear
   * Descrição: Remove todos os subscribers de todos os eventos.
   */
  function clear(): void {
    handlers.clear()
  }

  return { publish, subscribe, once, clear }
}
