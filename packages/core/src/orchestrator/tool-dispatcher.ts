import type { PermissionManager } from '../permissions/types'
import type { ToolRegistry, ToolResult } from '../tools/types'

/**
 * Contexto passado ao ToolDispatcher para cada execucao.
 * @param sessionId - ID da sessao atual
 * @param signal - Signal para cancelamento
 */
export interface DispatchContext {
  /** ID da sessao atual */
  sessionId: string
  /** Signal para cancelamento */
  signal?: AbortSignal
}

/**
 * Interface do ToolDispatcher.
 * Despacha tool calls verificando permissoes antes de executar.
 * @param dispatch - Despacha uma tool call com verificacao de permissao
 * @param toolName - Nome da tool a despachar
 * @param args - Argumentos da tool
 * @param ctx - Contexto de despacho
 * @returns Resultado da tool call
 */
export interface ToolDispatcher {
  /** Despacha uma tool call com verificacao de permissao */
  dispatch(toolName: string, args: unknown, ctx: DispatchContext): Promise<ToolResult>
}

/**
 * Cria uma instancia do ToolDispatcher.
 * Intercepta tool calls do LLM, verifica permissoes e delega para o ToolRegistry.
 * @param tools - Registry de tools disponiveis
 * @param permissions - Manager de permissoes
 * @returns Instancia do ToolDispatcher
 */
export function createToolDispatcher(
  tools: ToolRegistry,
  permissions: PermissionManager,
): ToolDispatcher {
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

    // 2. Verificar permissao
    const target = extractTarget(toolName, args)
    const decision = permissions.check(toolName, target)

    if (decision.decision === 'deny') {
      return { success: false, error: `Permission denied for tool "${toolName}" on "${target}"` }
    }

    if (decision.decision === 'ask') {
      // Por enquanto, retorna erro pedindo permissao
      // Na Fase 3 (CLI), isso vai pausar e perguntar ao usuario
      return {
        success: false,
        error: `Permission required for tool "${toolName}" on "${target}". User approval needed.`,
      }
    }

    // 3. Verificar abort
    if (ctx.signal?.aborted) {
      return { success: false, error: 'Operation aborted' }
    }

    // 4. Executar tool
    return tools.execute(toolName, args)
  }

  return { dispatch }
}

/**
 * Extrai o target (path/comando) dos args para verificacao de permissao.
 * Busca campos comuns como path, file, command.
 * @param toolName - Nome da tool
 * @param args - Argumentos da tool
 * @returns Target (path/comando)
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
