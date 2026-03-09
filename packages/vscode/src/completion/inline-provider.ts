/**
 * InlineProvider — VS Code InlineCompletionItemProvider.
 *
 * Pipeline: User digita → debounce 150ms → pre-filter → context build →
 *   CoreBridge completion.complete → ghost text
 *
 * O CancellationToken do VS Code funciona como debounce natural:
 * se o user digita outra tecla, o token anterior é cancelado.
 */

import * as vscode from 'vscode'
import type { CoreBridge } from '../bridge/core-bridge.js'
import type { CompletionResult } from '../bridge/protocol.js'
import { buildCompletionContext } from './context-builder.js'

export class InlineProvider implements vscode.InlineCompletionItemProvider {
  constructor(private bridge: CoreBridge) {}

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
