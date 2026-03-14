/**
 * context-builder
 * Descrição: Constrói contexto FIM (Fill-in-the-Middle) para inline completion.
 * Extrai prefix (até 100 linhas antes do cursor) e suffix (até 50 linhas após o cursor).
 */

import * as vscode from 'vscode'

/** MAX_PREFIX_LINES - Número máximo de linhas antes do cursor para incluir no prefixo */
const MAX_PREFIX_LINES = 100
/** MAX_SUFFIX_LINES - Número máximo de linhas após o cursor para incluir no sufixo */
const MAX_SUFFIX_LINES = 50

/**
 * CompletionContext
 * Descrição: Contexto FIM (Fill-in-the-Middle) para alimentar o modelo de completion.
 */
export interface CompletionContext {
  /** Texto antes da posição do cursor */
  prefix: string
  /** Texto após a posição do cursor */
  suffix: string
}

/**
 * buildCompletionContext
 * Descrição: Extrai o contexto de prefix e suffix ao redor da posição do cursor no documento.
 * @param document - Documento de texto ativo no editor
 * @param position - Posição do cursor no documento
 * @returns Objeto CompletionContext com prefix e suffix extraídos
 */
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
