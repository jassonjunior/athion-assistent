import { z } from 'zod/v4'
import type { ToolDefinition, ToolRegistry, ToolResult } from './types'

/**
 * Helper para criar uma ToolDefinition com type-safety completa.
 * Infere automaticamente o tipo dos parâmetros a partir do schema Zod.
 * @template TParams - Tipo inferido do schema Zod
 * @template TResult - Tipo do resultado da execução
 * @param definition - Definição da tool com schema e executor
 * @returns A mesma definição, tipada corretamente
 * @example
 * const readFile = defineTool({
 *   name: 'read_file',
 *   description: 'Lê o conteúdo de um arquivo',
 *   parameters: z.object({ path: z.string() }),
 *   execute: async ({ path }) => ({ success: true, data: '...' }),
 * })
 */
export function defineTool<TParams, TResult>(
  definition: ToolDefinition<TParams, TResult>,
): ToolDefinition<TParams, TResult> {
  return definition
}

/**
 * Cria uma instância do Tool Registry.
 * Centraliza registro, busca e execução de tools com validação Zod.
 * @returns Instância do ToolRegistry pronta para uso
 * @example
 * const registry = createToolRegistry()
 * registry.register(readFileTool)
 * const result = await registry.execute('read_file', { path: './src/index.ts' })
 */
export function createToolRegistry(): ToolRegistry {
  const tools = new Map<string, ToolDefinition>()

  /**
   * Registra uma nova tool no registry.
   * @param tool - Definição completa da tool
   * @throws Se já existir uma tool com o mesmo nome
   */
  function register(tool: ToolDefinition): void {
    if (tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`)
    }
    tools.set(tool.name, tool)
  }

  /**
   * Remove uma tool do registry pelo nome.
   * @param name - Nome da tool a remover
   */
  function unregister(name: string): void {
    tools.delete(name)
  }

  /**
   * Busca uma tool pelo nome.
   * @param name - Nome da tool
   * @returns A definição da tool ou undefined se não existir
   */
  function get(name: string): ToolDefinition | undefined {
    return tools.get(name)
  }

  /**
   * Lista todas as tools registradas.
   * @returns Array com todas as definições de tools
   */
  function list(): ToolDefinition[] {
    return Array.from(tools.values())
  }

  /**
   * Executa uma tool pelo nome com os parâmetros fornecidos.
   * Valida os parâmetros contra o schema Zod antes de executar.
   * @param name - Nome da tool a executar
   * @param params - Parâmetros (serão validados pelo schema)
   * @returns Resultado da execução
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
