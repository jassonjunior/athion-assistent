/**
 * DiffManager — Gerencia diffs sugeridos pelo assistente.
 *
 * Quando o assistente sugere mudanças, mostra decorações inline
 * (verde = adicionado, vermelho = removido) com CodeLens para
 * Accept/Reject por bloco.
 */

import * as vscode from 'vscode'

export interface PendingDiff {
  id: string
  uri: vscode.Uri
  range: vscode.Range
  originalText: string
  newText: string
}

export class DiffManager implements vscode.Disposable {
  private pendingDiffs: PendingDiff[] = []
  private addedDecoration: vscode.TextEditorDecorationType
  private removedDecoration: vscode.TextEditorDecorationType

  constructor() {
    this.addedDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(40, 167, 69, 0.15)',
      isWholeLine: true,
      after: {
        contentText: ' ✓ Accept | ✗ Reject',
        color: 'rgba(150, 150, 150, 0.5)',
        fontStyle: 'italic',
      },
    })

    this.removedDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: 'rgba(220, 53, 69, 0.15)',
      isWholeLine: true,
      textDecoration: 'line-through',
    })
  }

  /** Add a diff to be displayed */
  addDiff(diff: PendingDiff): void {
    this.pendingDiffs.push(diff)
    this.refreshDecorations()
  }

  /** Accept the diff at current cursor position */
  acceptCurrent(): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) return

    const pos = editor.selection.active
    const diff = this.findDiffAt(editor.document.uri, pos)
    if (!diff) return

    editor.edit((builder) => {
      builder.replace(diff.range, diff.newText)
    })

    this.removeDiff(diff.id)
  }

  /** Reject the diff at current cursor position */
  rejectCurrent(): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) return

    const pos = editor.selection.active
    const diff = this.findDiffAt(editor.document.uri, pos)
    if (!diff) return

    this.removeDiff(diff.id)
  }

  /** Accept all pending diffs */
  acceptAll(): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) return

    const fileDiffs = this.pendingDiffs.filter(
      (d) => d.uri.toString() === editor.document.uri.toString(),
    )

    if (fileDiffs.length === 0) return

    // Apply in reverse order to maintain line positions
    editor.edit((builder) => {
      for (const diff of [...fileDiffs].reverse()) {
        builder.replace(diff.range, diff.newText)
      }
    })

    this.pendingDiffs = this.pendingDiffs.filter(
      (d) => d.uri.toString() !== editor.document.uri.toString(),
    )
    this.refreshDecorations()
  }

  /** Reject all pending diffs */
  rejectAll(): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) return

    this.pendingDiffs = this.pendingDiffs.filter(
      (d) => d.uri.toString() !== editor.document.uri.toString(),
    )
    this.refreshDecorations()
  }

  dispose(): void {
    this.addedDecoration.dispose()
    this.removedDecoration.dispose()
    this.pendingDiffs = []
  }

  // ─── Private ──────────────────────────────────────────────────────

  private findDiffAt(uri: vscode.Uri, position: vscode.Position): PendingDiff | undefined {
    return this.pendingDiffs.find(
      (d) => d.uri.toString() === uri.toString() && d.range.contains(position),
    )
  }

  private removeDiff(id: string): void {
    this.pendingDiffs = this.pendingDiffs.filter((d) => d.id !== id)
    this.refreshDecorations()
  }

  private refreshDecorations(): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) return

    const fileDiffs = this.pendingDiffs.filter(
      (d) => d.uri.toString() === editor.document.uri.toString(),
    )

    const addedRanges: vscode.DecorationOptions[] = []
    const removedRanges: vscode.DecorationOptions[] = []

    for (const diff of fileDiffs) {
      if (diff.newText.length > diff.originalText.length) {
        addedRanges.push({ range: diff.range })
      } else {
        removedRanges.push({ range: diff.range })
      }
    }

    editor.setDecorations(this.addedDecoration, addedRanges)
    editor.setDecorations(this.removedDecoration, removedRanges)
  }
}
