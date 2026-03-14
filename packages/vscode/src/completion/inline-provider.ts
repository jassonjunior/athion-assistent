/**
 * InlineProvider
 * Descrição: VS Code InlineCompletionItemProvider para sugestões de código inline (ghost text).
 * Pipeline: Usuário digita -> pre-filter -> context build -> CoreBridge completion.complete -> ghost text.
 * O CancellationToken do VS Code funciona como debounce natural:
 * se o usuário digita outra tecla, o token anterior é cancelado.
 */

import * as vscode from 'vscode'
import type { CoreBridge } from '../bridge/core-bridge.js'
import type { CompletionResult } from '../bridge/protocol.js'
import { buildCompletionContext } from './context-builder.js'

/**
 * InlineProvider
 * Descrição: Provedor de inline completion que consulta o CoreBridge para obter sugestões de código.
 */
export class InlineProvider implements vscode.InlineCompletionItemProvider {
  /**
   * constructor
   * Descrição: Cria o InlineProvider com a bridge para comunicação com o core.
   * @param bridge - Instância do CoreBridge para requisições de completion
   */
  constructor(private bridge: CoreBridge) {}

  /**
   * provideInlineCompletionItems
   * Descrição: Fornece itens de inline completion para o VS Code. Realiza pre-filter,
   * constrói contexto FIM e consulta o core para obter sugestões.
   * @param document - Documento de texto ativo
   * @param position - Posição do cursor
   * @param _context - Contexto de inline completion do VS Code
   * @param token - Token de cancelamento
   * @returns Lista de InlineCompletionItem ou array vazio
   */
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[]> {
    // Check if inline is enabled
    const config = vscode.workspace.getConfiguration('athion')
    if (!config.get<boolean>('inlineEnabled', true)) return []

    // Check if bridge is ready
    if (!this.bridge.ready) return []

    // Pre-filter: skip if line is empty or in comment
    const line = document.lineAt(position.line).text
    const beforeCursor = line.slice(0, position.character).trim()
    if (!beforeCursor) return []

    // Build context (prefix/suffix)
    const ctx = buildCompletionContext(document, position)

    // Check cancellation before network call
    if (token.isCancellationRequested) return []

    try {
      const result = await this.bridge.request<CompletionResult>(
        'completion.complete',
        {
          prefix: ctx.prefix,
          suffix: ctx.suffix,
          language: document.languageId,
          filePath: document.fileName,
        },
        5000, // 5s timeout for completions
      )

      if (token.isCancellationRequested) return []
      if (!result.text.trim()) return []

      return [new vscode.InlineCompletionItem(result.text, new vscode.Range(position, position))]
    } catch {
      // Timeout or error — silently fail
      return []
    }
  }
}
