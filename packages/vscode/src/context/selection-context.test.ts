import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('vscode', () => {
  const mockEditor = {
    document: {
      getText: vi.fn(() => 'selected text'),
      uri: { fsPath: '/workspace/src/test.ts' },
      languageId: 'typescript',
      fileName: '/workspace/src/test.ts',
    },
    selection: {
      start: { line: 5 },
      end: { line: 10 },
    },
  }

  return {
    window: {
      activeTextEditor: mockEditor,
      showWarningMessage: vi.fn(),
    },
    workspace: {
      getWorkspaceFolder: vi.fn(() => ({
        uri: { fsPath: '/workspace' },
      })),
      asRelativePath: vi.fn(() => 'src/test.ts'),
    },
  }
})

import { getSelectionContext } from './selection-context.js'
import * as vscode from 'vscode'

describe('getSelectionContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mocks
    const editor = vscode.window.activeTextEditor as unknown as {
      document: { getText: ReturnType<typeof vi.fn> }
      selection: { start: { line: number }; end: { line: number } }
    }
    editor.document.getText.mockReturnValue('selected text')
    editor.selection.start.line = 5
    editor.selection.end.line = 10
  })

  it('retorna contexto da selecao valida', () => {
    const result = getSelectionContext()

    expect(result).not.toBeNull()
    expect(result?.text).toBe('selected text')
    expect(result?.language).toBe('typescript')
    expect(result?.filePath).toBe('src/test.ts')
    expect(result?.startLine).toBe(6) // 1-based
    expect(result?.endLine).toBe(11) // 1-based
  })

  it('retorna null e mostra warning se nao ha editor ativo', () => {
    const original = vscode.window.activeTextEditor
    ;(vscode.window as { activeTextEditor: unknown }).activeTextEditor = undefined

    const result = getSelectionContext()

    expect(result).toBeNull()
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith('Nenhum editor ativo')
    ;(vscode.window as { activeTextEditor: unknown }).activeTextEditor = original
  })

  it('retorna null e mostra warning se selecao esta vazia', () => {
    const editor = vscode.window.activeTextEditor as unknown as {
      document: { getText: ReturnType<typeof vi.fn> }
    }
    editor.document.getText.mockReturnValue('   ')

    const result = getSelectionContext()

    expect(result).toBeNull()
    expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
      'Selecione um trecho de código primeiro',
    )
  })

  it('usa caminho absoluto quando fora do workspace', () => {
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(undefined)

    const result = getSelectionContext()

    expect(result?.filePath).toBe('/workspace/src/test.ts')
  })

  it('usa caminho relativo quando dentro do workspace', () => {
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue({
      uri: { fsPath: '/workspace' },
    } as never)
    vi.mocked(vscode.workspace.asRelativePath).mockReturnValue('src/test.ts')

    const result = getSelectionContext()

    expect(result?.filePath).toBe('src/test.ts')
  })

  it('converte linhas para 1-based', () => {
    const editor = vscode.window.activeTextEditor as unknown as {
      selection: { start: { line: number }; end: { line: number } }
    }
    editor.selection.start.line = 0
    editor.selection.end.line = 0

    const result = getSelectionContext()

    expect(result?.startLine).toBe(1)
    expect(result?.endLine).toBe(1)
  })
})
