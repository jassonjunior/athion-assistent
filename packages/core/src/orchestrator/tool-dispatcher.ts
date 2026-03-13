import type { PermissionManager } from '../permissions/types'
import type { ToolRegistry, ToolResult } from '../tools/types'
import { getToolLevel } from '../tools/types'

/** DispatchContext
 * Descrição: Contexto passado ao ToolDispatcher para cada execução de tool.
 */
export interface DispatchContext {
  /** sessionId
   * Descrição: ID da sessão atual
   */
  sessionId: string
  /** signal
   * Descrição: Signal para cancelamento da operação (opcional)
   */
  signal?: AbortSignal
  /** onPermissionRequest
   * Descrição: Callback para resolução interativa de permissão.
   * Chamado quando decision='ask'. Retorna 'allow' ou 'deny'.
   * @param toolName - Nome da tool que solicita permissão
   * @param target - Alvo da operação (path, comando, etc.)
   * @returns Promise com 'allow' ou 'deny'
   */
  onPermissionRequest?: (toolName: string, target: string) => Promise<'allow' | 'deny'>
}

/** ToolDispatcher
 * Descrição: Interface do ToolDispatcher.
 * Despacha tool calls verificando permissões antes de executar.
 */
export interface ToolDispatcher {
  /** dispatch
   * Descrição: Despacha uma tool call com verificação de permissão
   * @param toolName - Nome da tool a despachar
   * @param args - Argumentos da tool
   * @param ctx - Contexto de despacho com sessão e permissões
   * @returns Promise com o resultado da execução da tool
   */
  dispatch(toolName: string, args: unknown, ctx: DispatchContext): Promise<ToolResult>
}

/** createToolDispatcher
 * Descrição: Cria uma instância do ToolDispatcher.
 * Intercepta tool calls do LLM, verifica permissões e delega para o ToolRegistry.
 * @param tools - Registry de tools disponíveis
 * @param permissions - Manager de permissões
 * @returns Instância do ToolDispatcher
 */
export function createToolDispatcher(
  tools: ToolRegistry,
  permissions: PermissionManager,
): ToolDispatcher {
  /** dispatch
   * Descrição: Verifica permissões e executa a tool solicitada
   * @param toolName - Nome da tool a executar
   * @param args - Argumentos da tool
   * @param ctx - Contexto com sessão e handlers de permissão
   * @returns Promise com o resultado da tool
   */
  async function dispatch(
    toolName: string,
    args: unknown,
    ctx: DispatchContext,
  ): Promise<ToolResult> {
    // 1. Verificar se a tool existe
    const tool = tools.get(toolName)
    if (!tool) {
      return { success: false, error: `Tool "${toolName}" not found` }
    }

    // 2. Verificar permissão
    // Tools com level='agent' passam por permission check (core tools).
    // Tools com level='orchestrator' (plugins, task) são trusted.
    const needsPermission = getToolLevel(tool) === 'agent'

    if (needsPermission) {
      const target = extractTarget(toolName, args)
      const decision = permissions.check(toolName, target)

      if (decision.decision === 'deny') {
        return { success: false, error: `Permission denied for tool "${toolName}" on "${target}"` }
      }

      if (decision.decision === 'ask') {
        if (ctx.onPermissionRequest) {
          const userDecision = await ctx.onPermissionRequest(toolName, target)
          if (userDecision === 'deny') {
            return {
              success: false,
              error: `Permission denied for tool "${toolName}" on "${target}"`,
            }
          }
          // allow: continua para execução
        } else {
          return {
            success: false,
            error: `Permission required for tool "${toolName}" on "${target}". No handler registered.`,
          }
        }
      }
    }

    // 3. Verificar abort
    if (ctx.signal?.aborted) {
      return { success: false, error: 'Operation aborted' }
    }

    // 4. Executar a tool
    return tools.execute(toolName, args)
  }

  return { dispatch }
}

/** extractTarget
 * Descrição: Extrai o target (path/comando) dos argumentos para verificação de permissão.
 * Busca campos comuns como path, file, command.
 * @param _toolName - Nome da tool (não utilizado atualmente)
 * @param args - Argumentos da tool
 * @returns String com o target extraído ou '*' se nenhum campo relevante encontrado
 */
function extractTarget(_toolName: string, args: unknown): string {
  if (args && typeof args === 'object') {
    const obj = args as Record<string, unknown>
    if (typeof obj.path === 'string') return obj.path
    if (typeof obj.file === 'string') return obj.file
    if (typeof obj.command === 'string') return obj.command
    if (typeof obj.pattern === 'string') return obj.pattern
  }
  return '*'
}
