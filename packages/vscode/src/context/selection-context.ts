/**
 * Extrai contexto da seleção atual do editor.
 */

import * as vscode from 'vscode'

export interface SelectionContext {
  text: string
  language: string
  filePath: string
  startLine: number
  endLine: number
}

export function getSelectionContext(): SelectionContext | null {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    vscode.window.showWarningMessage('Nenhum editor ativo')
    return null
  }

  const selection = editor.selection
  const text = editor.document.getText(selection)

  if (!text.trim()) {
    vscode.window.showWarningMessage('Selecione um trecho de código primeiro')
    return null
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri)
  const filePath = workspaceFolder
    ? vscode.workspace.asRelativePath(editor.document.uri)
    : editor.document.fileName

  return {
    text,
    language: editor.document.languageId,
    filePath,
    startLine: selection.start.line + 1,
    endLine: selection.end.line + 1,
  }
}
