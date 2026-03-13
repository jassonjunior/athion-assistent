import { z } from 'zod/v4'
import type { ToolDefinition, ToolRegistry, ToolResult } from './types'

/** defineTool
 * Descrição: Helper para criar uma ToolDefinition com type-safety completa.
 * Infere automaticamente o tipo dos parâmetros a partir do schema Zod.
 * @template TParams - Tipo inferido do schema Zod
 * @template TResult - Tipo do resultado da execução
 * @param definition - Definição da tool com schema e executor
 * @returns A mesma definição, tipada corretamente
 */
export function defineTool<TParams, TResult>(
  definition: ToolDefinition<TParams, TResult>,
): ToolDefinition<TParams, TResult> {
  return definition
}

/** createToolRegistry
 * Descrição: Cria uma instância do Tool Registry.
 * Centraliza registro, busca e execução de tools com validação Zod.
 * @returns Instância do ToolRegistry pronta para uso
 */
export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ToolDefinition>()

  /** register
   * Descrição: Registra uma nova tool no registry
   * @param tool - Definição completa da tool
   */
  function register(tool: ToolDefinition): void {
    if (tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`)
    }
    tools.set(tool.name, tool)
  }

  /** unregister
   * Descrição: Remove uma tool do registry pelo nome
   * @param name - Nome da tool a remover
   */
  function unregister(name: string): void {
    tools.delete(name)
  }

  /** get
   * Descrição: Busca uma tool pelo nome no registro interno
   * @param name - Nome da tool
   * @returns A definição da tool ou undefined se não existir
   */
  function get(name: string): ToolDefinition | undefined {
    return tools.get(name)
  }

  /** list
   * Descrição: Lista todas as tools registradas no registry
   * @returns Array com todas as definições de tools
   */
  function list(): ToolDefinition[] {
    return Array.from(tools.values())
  }

  /** execute
   * Descrição: Executa uma tool pelo nome, validando parâmetros via Zod antes da execução
   * @param name - Nome da tool a executar
   * @param params - Parâmetros que serão validados pelo schema
   * @returns Promise com o resultado da execução
   */
  async function execute(name: string, params: unknown): Promise<ToolResult> {
    const tool = tools.get(name)
    if (!tool) {
      return { success: false, error: `Tool '${name}' not found` }
    }

    const parsed = z.safeParse(tool.parameters, params)
    if (!parsed.success) {
      return {
        success: false,
        error: `Invalid parameters: ${parsed.error.message}`,
      }
    }

    try {
      return await tool.execute(parsed.data)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  return { register, unregister, get, list, execute }
}
