/**
 * selection-context
 * Descrição: Extrai contexto da seleção atual do editor ativo do VS Code.
 */

import * as vscode from 'vscode'

/**
 * SelectionContext
 * Descrição: Informações contextuais sobre a seleção de texto no editor.
 */
export interface SelectionContext {
  /** Texto selecionado pelo usuário */
  text: string
  /** Linguagem de programação do arquivo (languageId) */
  language: string
  /** Caminho relativo do arquivo (ou absoluto se fora do workspace) */
  filePath: string
  /** Número da linha inicial da seleção (1-based) */
  startLine: number
  /** Número da linha final da seleção (1-based) */
  endLine: number
}

/**
 * getSelectionContext
 * Descrição: Obtém o contexto da seleção atual no editor ativo. Mostra avisos se não houver editor ou seleção.
 * @returns Objeto SelectionContext com informações da seleção ou null se não houver seleção válida
 */
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
