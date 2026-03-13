import type { z } from 'zod/v4'

/** ToolResult
 * Descrição: Resultado da execução de uma tool.
 * Pode ser sucesso (com dados) ou erro (com mensagem).
 * @template T - Tipo dos dados retornados em caso de sucesso
 */
export interface ToolResult<T = unknown> {
  /** success
   * Descrição: Indica se a execução foi bem-sucedida
   */
  success: boolean
  /** data
   * Descrição: Dados retornados pela tool (quando success=true)
   */
  data?: T
  /** error
   * Descrição: Mensagem de erro (quando success=false)
   */
  error?: string
}

/** ToolLevel
 * Descrição: Nível de acesso de uma tool.
 * - 'orchestrator': acessível diretamente pelo orchestrator (e também por agentes)
 * - 'agent': acessível APENAS por subagentes (não aparece no prompt do orchestrator)
 *
 * Default: 'agent' para core tools, 'orchestrator' para plugin tools.
 */
export type ToolLevel = 'orchestrator' | 'agent'

/** ToolDefinition
 * Descrição: Definição completa de uma tool que o LLM pode invocar.
 * Cada tool tem um schema Zod para validação dos parâmetros.
 * @template TParams - Tipo dos parâmetros (inferido do Zod schema)
 * @template TResult - Tipo do resultado retornado pela tool
 */
export interface ToolDefinition<TParams = unknown, TResult = unknown> {
  /** name
   * Descrição: Identificador único da tool (ex: 'read_file', 'run_command')
   */
  name: string
  /** description
   * Descrição: Texto descritivo para o LLM entender quando usar esta tool
   */
  description: string
  /** parameters
   * Descrição: Schema Zod para validação dos parâmetros de entrada
   */
  parameters: z.ZodType<TParams>
  /** execute
   * Descrição: Função que executa a tool com os parâmetros validados
   * @param params - Parâmetros validados pelo schema Zod
   * @returns Promise com o resultado da execução
   */
  execute: (params: TParams) => Promise<ToolResult<TResult>>
  /** level
   * Descrição: Nível de acesso da tool.
   * - 'orchestrator': orchestrator pode chamar diretamente + subagentes também
   * - 'agent': APENAS subagentes podem usar (default para core tools)
   * Se não definido, o sistema infere: core tools -> 'agent', plugin tools -> 'orchestrator'
   */
  level?: ToolLevel | undefined
}

/** getToolLevel
 * Descrição: Retorna o nível efetivo de uma tool.
 * Se a tool não tem level definido, assume 'orchestrator' (default seguro para plugins).
 * Core tools devem sempre definir level: 'agent' explicitamente.
 * @param tool - Definição da tool
 * @returns Nível efetivo da tool ('orchestrator' ou 'agent')
 */
export function getToolLevel(tool: ToolDefinition): ToolLevel {
  return tool.level ?? 'orchestrator'
}

/** isOrchestratorTool
 * Descrição: Verifica se uma tool é acessível pelo orchestrator diretamente.
 * @param tool - Definição da tool a verificar
 * @returns true se a tool tem nível 'orchestrator'
 */
export function isOrchestratorTool(tool: ToolDefinition): boolean {
  return getToolLevel(tool) === 'orchestrator'
}

/** ToolRegistry
 * Descrição: Interface do Tool Registry.
 * Centraliza registro, busca e execução de tools com validação Zod.
 */
export interface ToolRegistry {
  /** register
   * Descrição: Registra uma nova tool no registry
   * @param tool - Definição completa da tool
   */
  register(tool: ToolDefinition): void

  /** unregister
   * Descrição: Remove uma tool do registry pelo nome
   * @param name - Nome da tool a remover
   */
  unregister(name: string): void

  /** get
   * Descrição: Busca uma tool pelo nome
   * @param name - Nome da tool
   * @returns A definição da tool ou undefined se não existir
   */
  get(name: string): ToolDefinition | undefined

  /** list
   * Descrição: Lista todas as tools registradas
   * @returns Array com todas as definições de tools
   */
  list(): ToolDefinition[]

  /** execute
   * Descrição: Executa uma tool pelo nome com os parâmetros fornecidos.
   * Valida os parâmetros contra o schema Zod antes de executar.
   * @param name - Nome da tool a executar
   * @param params - Parâmetros (serão validados pelo schema)
   * @returns Promise com o resultado da execução
   */
  execute(name: string, params: unknown): Promise<ToolResult>
}
