import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('vscode', () => {
  const mockActiveEditor = {
    document: {
      uri: {
        toString: () => 'file:///workspace/test.ts',
      },
    },
    selection: {
      active: {
        line: 5,
        character: 0,
      },
    },
    edit: vi.fn((callback: (builder: unknown) => void) => {
      const builder = { replace: vi.fn() }
      callback(builder)
      return Promise.resolve(true)
    }),
    setDecorations: vi.fn(),
  }

  return {
    window: {
      createTextEditorDecorationType: vi.fn(() => ({
        dispose: vi.fn(),
      })),
      get activeTextEditor() {
        return mockActiveEditor
      },
    },
  }
})

import { DiffManager, type PendingDiff } from './diff-manager.js'
import * as vscode from 'vscode'

function getActiveEditor() {
  return vscode.window.activeTextEditor as unknown as {
    edit: ReturnType<typeof vi.fn>
    setDecorations: ReturnType<typeof vi.fn>
  }
}

function createDiff(overrides: Partial<PendingDiff> = {}): PendingDiff {
  return {
    id: overrides.id ?? 'diff-1',
    uri:
      overrides.uri ??
      ({
        toString: () => 'file:///workspace/test.ts',
      } as never),
    range:
      overrides.range ??
      ({
        contains: (pos: { line: number }) => pos.line >= 3 && pos.line <= 7,
      } as never),
    originalText: overrides.originalText ?? 'old code',
    newText: overrides.newText ?? 'new code that is longer',
  }
}

describe('DiffManager', () => {
  let manager: DiffManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new DiffManager()
  })

  describe('constructor', () => {
    it('cria decoracoes de texto adicionado e removido', () => {
      expect(vscode.window.createTextEditorDecorationType).toHaveBeenCalledTimes(2)
    })
  })

  describe('addDiff', () => {
    it('adiciona diff e atualiza decoracoes', () => {
      const diff = createDiff()
      manager.addDiff(diff)

      expect(getActiveEditor().setDecorations).toHaveBeenCalled()
    })

    it('classifica como adicionado quando newText e maior que originalText', () => {
      const diff = createDiff({
        newText: 'this is a longer new text',
        originalText: 'short',
      })
      manager.addDiff(diff)

      expect(getActiveEditor().setDecorations).toHaveBeenCalledTimes(2)
    })

    it('classifica como removido quando originalText e maior que newText', () => {
      const diff = createDiff({
        newText: 'short',
        originalText: 'this is a longer original text',
      })
      manager.addDiff(diff)

      expect(getActiveEditor().setDecorations).toHaveBeenCalledTimes(2)
    })
  })

  describe('acceptCurrent', () => {
    it('aplica a mudanca no editor e remove diff', () => {
      const diff = createDiff()
      manager.addDiff(diff)
      vi.clearAllMocks()

      manager.acceptCurrent()

      expect(getActiveEditor().edit).toHaveBeenCalled()
    })

    it('nao faz nada se nao encontra diff na posicao do cursor', () => {
      const diff = createDiff({
        range: {
          contains: () => false,
        } as never,
      })
      manager.addDiff(diff)
      vi.clearAllMocks()

      manager.acceptCurrent()

      expect(getActiveEditor().edit).not.toHaveBeenCalled()
    })
  })

  describe('rejectCurrent', () => {
    it('remove diff sem aplicar mudanca', () => {
      const diff = createDiff()
      manager.addDiff(diff)
      vi.clearAllMocks()

      manager.rejectCurrent()

      expect(getActiveEditor().edit).not.toHaveBeenCalled()
      expect(getActiveEditor().setDecorations).toHaveBeenCalled()
    })

    it('nao faz nada se nao encontra diff', () => {
      const diff = createDiff({
        range: { contains: () => false } as never,
      })
      manager.addDiff(diff)
      vi.clearAllMocks()

      manager.rejectCurrent()

      expect(getActiveEditor().setDecorations).not.toHaveBeenCalled()
    })
  })

  describe('acceptAll', () => {
    it('aplica todos os diffs do arquivo ativo em ordem reversa', () => {
      const diff1 = createDiff({ id: 'diff-1' })
      const diff2 = createDiff({ id: 'diff-2' })
      manager.addDiff(diff1)
      manager.addDiff(diff2)
      vi.clearAllMocks()

      manager.acceptAll()

      expect(getActiveEditor().edit).toHaveBeenCalledOnce()
    })

    it('nao faz nada se nao ha diffs no arquivo ativo', () => {
      const diff = createDiff({
        uri: { toString: () => 'file:///other/file.ts' } as never,
      })
      manager.addDiff(diff)
      vi.clearAllMocks()

      manager.acceptAll()

      expect(getActiveEditor().edit).not.toHaveBeenCalled()
    })
  })

  describe('rejectAll', () => {
    it('remove todos os diffs do arquivo ativo', () => {
      const diff1 = createDiff({ id: 'diff-1' })
      const diff2 = createDiff({ id: 'diff-2' })
      manager.addDiff(diff1)
      manager.addDiff(diff2)
      vi.clearAllMocks()

      manager.rejectAll()

      expect(getActiveEditor().setDecorations).toHaveBeenCalled()
      expect(getActiveEditor().edit).not.toHaveBeenCalled()
    })
  })

  describe('dispose', () => {
    it('descarta decoracoes', () => {
      manager.dispose()

      // Verify decorations were created and have dispose methods
      const calls = vi.mocked(vscode.window.createTextEditorDecorationType).mock.results
      expect(calls[0]?.value.dispose).toHaveBeenCalled()
      expect(calls[1]?.value.dispose).toHaveBeenCalled()
    })
  })
})
