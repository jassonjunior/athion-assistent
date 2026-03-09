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
 * Nível de acesso de uma tool.
 *
 * - 'orchestrator' → acessível diretamente pelo orchestrator (e também por agentes)
 * - 'agent' → acessível APENAS por subagentes (não aparece no prompt do orchestrator)
 *
 * Default: 'agent' para core tools, 'orchestrator' para plugin tools.
 */
export type ToolLevel = 'orchestrator' | 'agent'

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
  /**
   * Nível de acesso da tool.
   * - 'orchestrator' → orchestrator pode chamar diretamente + subagentes também
   * - 'agent' → APENAS subagentes podem usar (default para core tools)
   *
   * Se não definido, o sistema infere:
   * - Core tools (read_file, etc.) → 'agent'
   * - Plugin tools → 'orchestrator'
   * - task → 'orchestrator'
   */
  level?: ToolLevel | undefined
}

/**
 * Retorna o nível efetivo de uma tool.
 * Se a tool não tem level definido, assume 'orchestrator' (default seguro para plugins).
 * Core tools devem sempre definir level: 'agent' explicitamente.
 */
export function getToolLevel(tool: ToolDefinition): ToolLevel {
  return tool.level ?? 'orchestrator'
}

/**
 * Verifica se uma tool é acessível pelo orchestrator diretamente.
 */
export function isOrchestratorTool(tool: ToolDefinition): boolean {
  return getToolLevel(tool) === 'orchestrator'
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
