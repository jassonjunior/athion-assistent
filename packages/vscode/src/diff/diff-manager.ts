/**
 * DiffManager
 * Descrição: Gerencia diffs sugeridos pelo assistente com decorações inline no editor.
 * Quando o assistente sugere mudanças, mostra decorações (verde = adicionado, vermelho = removido)
 * com opções de Accept/Reject por bloco.
 */

import * as vscode from 'vscode'

/**
 * PendingDiff
 * Descrição: Representa um diff pendente de aceitação/rejeição no editor.
 */
export interface PendingDiff {
  /** Identificador único do diff */
  id: string
  /** URI do arquivo onde o diff está */
  uri: vscode.Uri
  /** Range do texto original no editor */
  range: vscode.Range
  /** Texto original antes da mudança */
  originalText: string
  /** Texto novo sugerido pelo assistente */
  newText: string
}

/**
 * DiffManager
 * Descrição: Classe que gerencia o ciclo de vida dos diffs sugeridos pelo assistente.
 * Implementa vscode.Disposable para cleanup automático de recursos.
 */
export class DiffManager implements vscode.Disposable {
  /** Lista de diffs pendentes de aceitação */
  private pendingDiffs: PendingDiff[] = []
  /** Decoração para linhas adicionadas (fundo verde) */
  private addedDecoration: vscode.TextEditorDecorationType
  /** Decoração para linhas removidas (fundo vermelho com riscado) */
  private removedDecoration: vscode.TextEditorDecorationType

  /**
   * constructor
   * Descrição: Inicializa as decorações de texto para diffs adicionados e removidos.
   */
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

  /**
   * addDiff
   * Descrição: Adiciona um diff pendente e atualiza as decorações no editor.
   * @param diff - Diff pendente a ser adicionado
   * @returns void
   */
  addDiff(diff: PendingDiff): void {
    this.pendingDiffs.push(diff)
    this.refreshDecorations()
  }

  /**
   * acceptCurrent
   * Descrição: Aceita o diff na posição atual do cursor, aplicando a mudança sugerida.
   * @returns void
   */
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

  /**
   * rejectCurrent
   * Descrição: Rejeita o diff na posição atual do cursor, descartando a sugestão.
   * @returns void
   */
  rejectCurrent(): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) return

    const pos = editor.selection.active
    const diff = this.findDiffAt(editor.document.uri, pos)
    if (!diff) return

    this.removeDiff(diff.id)
  }

  /**
   * acceptAll
   * Descrição: Aceita todos os diffs pendentes no arquivo ativo, aplicando em ordem reversa para manter as posições.
   * @returns void
   */
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

  /**
   * rejectAll
   * Descrição: Rejeita todos os diffs pendentes no arquivo ativo, descartando todas as sugestões.
   * @returns void
   */
  rejectAll(): void {
    const editor = vscode.window.activeTextEditor
    if (!editor) return

    this.pendingDiffs = this.pendingDiffs.filter(
      (d) => d.uri.toString() !== editor.document.uri.toString(),
    )
    this.refreshDecorations()
  }

  /**
   * dispose
   * Descrição: Libera recursos das decorações e limpa a lista de diffs pendentes.
   * @returns void
   */
  dispose(): void {
    this.addedDecoration.dispose()
    this.removedDecoration.dispose()
    this.pendingDiffs = []
  }

  // ─── Private ──────────────────────────────────────────────────────

  /**
   * findDiffAt
   * Descrição: Encontra um diff pendente que contém a posição fornecida no arquivo especificado.
   * @param uri - URI do arquivo a buscar
   * @param position - Posição do cursor a verificar
   * @returns O PendingDiff encontrado ou undefined
   */
  private findDiffAt(uri: vscode.Uri, position: vscode.Position): PendingDiff | undefined {
    return this.pendingDiffs.find(
      (d) => d.uri.toString() === uri.toString() && d.range.contains(position),
    )
  }

  /**
   * removeDiff
   * Descrição: Remove um diff da lista de pendentes pelo ID e atualiza as decorações.
   * @param id - Identificador do diff a remover
   * @returns void
   */
  private removeDiff(id: string): void {
    this.pendingDiffs = this.pendingDiffs.filter((d) => d.id !== id)
    this.refreshDecorations()
  }

  /**
   * refreshDecorations
   * Descrição: Atualiza as decorações visuais de diff no editor ativo.
   * @returns void
   */
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
