/**
 * Constrói contexto FIM (Fill-in-the-Middle) para inline completion.
 *
 * Prefix: até 100 linhas antes do cursor
 * Suffix: até 50 linhas após o cursor
 */

import * as vscode from 'vscode'

const MAX_PREFIX_LINES = 100
const MAX_SUFFIX_LINES = 50

export interface CompletionContext {
  prefix: string
  suffix: string
}

export function buildCompletionContext(
  document: vscode.TextDocument,
  position: vscode.Position,
): CompletionContext {
  // Prefix: text from start of visible context to cursor
  const prefixStart = Math.max(0, position.line - MAX_PREFIX_LINES)
  const prefixRange = new vscode.Range(prefixStart, 0, position.line, position.character)
  const prefix = document.getText(prefixRange)

  // Suffix: text from cursor to end of visible context
  const suffixEnd = Math.min(document.lineCount - 1, position.line + MAX_SUFFIX_LINES)
  const suffixRange = new vscode.Range(
    position.line,
    position.character,
    suffixEnd,
    document.lineAt(suffixEnd).text.length,
  )
  const suffix = document.getText(suffixRange)

  return { prefix, suffix }
}
