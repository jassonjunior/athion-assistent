import type { z } from 'zod/v4'

/**
 * Resultado da execução de uma tool.
 * Pode ser sucesso (com dados) ou erro (com mensagem).
 */
export interface ToolResult<T = unknown> {
  /** Se a execução foi bem-sucedida */
  success: boolean
  /** Dados retornados pela tool (quando success=true) */
  data?: T
  /** Mensagem de erro (quando success=false) */
  error?: string
}

/**
 * Definição completa de uma tool que o LLM pode invocar.
 * Cada tool tem um schema Zod para validação dos parâmetros.
 * @template TParams - Tipo dos parâmetros (inferido do Zod schema)
 * @template TResult - Tipo do resultado retornado pela tool
 */
export interface ToolDefinition<TParams = unknown, TResult = unknown> {
  /** Identificador único da tool (ex: 'read_file', 'run_command') */
  name: string
  /** Descrição para o LLM entender quando usar esta tool */
  description: string
  /** Schema Zod para validação dos parâmetros */
  parameters: z.ZodType<TParams>
  /** Função que executa a tool com os parâmetros validados */
  execute: (params: TParams) => Promise<ToolResult<TResult>>
}

/**
 * Interface do Tool Registry.
 * Centraliza registro, busca e execução de tools.
 */
export interface ToolRegistry {
  /**
   * Registra uma nova tool no registry.
   * @param tool - Definição completa da tool
   * @throws Se já existir uma tool com o mesmo nome
   */
  register(tool: ToolDefinition): void

  /**
   * Remove uma tool do registry pelo nome.
   * @param name - Nome da tool a remover
   */
  unregister(name: string): void

  /**
   * Busca uma tool pelo nome.
   * @param name - Nome da tool
   * @returns A definição da tool ou undefined se não existir
   */
  get(name: string): ToolDefinition | undefined

  /**
   * Lista todas as tools registradas.
   * @returns Array com todas as definições de tools
   */
  list(): ToolDefinition[]

  /**
   * Executa uma tool pelo nome com os parâmetros fornecidos.
   * Valida os parâmetros contra o schema Zod antes de executar.
   * @param name - Nome da tool a executar
   * @param params - Parâmetros (serão validados pelo schema)
   * @returns Resultado da execução
   */
  execute(name: string, params: unknown): Promise<ToolResult>
}
