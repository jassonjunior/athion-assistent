/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, defaultVal: unknown) => defaultVal),
    })),
  },
  Range: class MockRange {
    constructor(
      public startLine: number,
      public startChar: number,
      public endLine?: number,
      public endChar?: number,
    ) {
      if (endLine === undefined) {
        // Range(Position, Position)
        this.endLine = startLine
        this.endChar = startChar
      }
    }
  },
  InlineCompletionItem: class MockInlineCompletionItem {
    constructor(
      public insertText: string,
      public range: unknown,
    ) {}
  },
}))

vi.mock('./context-builder.js', () => ({
  buildCompletionContext: vi.fn(() => ({
    prefix: 'const x = ',
    suffix: '\nconsole.log(x)',
  })),
}))

import { InlineProvider } from './inline-provider.js'
import { buildCompletionContext } from './context-builder.js'

function createMockBridge(
  overrides: Partial<{ ready: boolean; request: ReturnType<typeof vi.fn> }> = {},
) {
  return {
    ready: overrides.ready ?? true,
    request: overrides.request ?? vi.fn(async () => ({ text: '42' })),
  }
}

function createMockDocument() {
  return {
    lineAt: vi.fn((line: number) => ({
      text: 'const x = ',
    })),
    languageId: 'typescript',
    fileName: '/workspace/test.ts',
    getText: vi.fn(() => ''),
  }
}

function createMockPosition(line = 0, character = 10) {
  return { line, character }
}

function createMockToken(cancelled = false) {
  return {
    isCancellationRequested: cancelled,
    onCancellationRequested: vi.fn(),
  }
}

describe('InlineProvider', () => {
  let provider: InlineProvider
  let bridge: ReturnType<typeof createMockBridge>

  beforeEach(() => {
    vi.clearAllMocks()
    bridge = createMockBridge()
    provider = new InlineProvider(bridge as never)
  })

  describe('provideInlineCompletionItems', () => {
    it('retorna array vazio se inline desabilitado', async () => {
      const { workspace } = await import('vscode')
      vi.mocked(workspace.getConfiguration).mockReturnValue({
        get: vi.fn((_key: string, _def: unknown) => false),
      } as never)

      const result = await provider.provideInlineCompletionItems(
        createMockDocument() as never,
        createMockPosition() as never,
        {} as never,
        createMockToken() as never,
      )

      expect(result).toEqual([])
    })

    it('retorna array vazio se bridge nao esta pronto', async () => {
      const { workspace } = await import('vscode')
      vi.mocked(workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => true),
      } as never)

      bridge.ready = false

      const result = await provider.provideInlineCompletionItems(
        createMockDocument() as never,
        createMockPosition() as never,
        {} as never,
        createMockToken() as never,
      )

      expect(result).toEqual([])
    })

    it('retorna array vazio se linha antes do cursor esta vazia', async () => {
      const { workspace } = await import('vscode')
      vi.mocked(workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => true),
      } as never)

      const doc = createMockDocument()
      doc.lineAt.mockReturnValue({ text: '   ' })

      const result = await provider.provideInlineCompletionItems(
        doc as never,
        createMockPosition(0, 3) as never,
        {} as never,
        createMockToken() as never,
      )

      expect(result).toEqual([])
    })

    it('retorna array vazio se token cancelado antes da chamada', async () => {
      const { workspace } = await import('vscode')
      vi.mocked(workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => true),
      } as never)

      const result = await provider.provideInlineCompletionItems(
        createMockDocument() as never,
        createMockPosition() as never,
        {} as never,
        createMockToken(true) as never,
      )

      expect(result).toEqual([])
    })

    it('chama bridge.request com contexto correto', async () => {
      const { workspace } = await import('vscode')
      vi.mocked(workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => true),
      } as never)

      await provider.provideInlineCompletionItems(
        createMockDocument() as never,
        createMockPosition() as never,
        {} as never,
        createMockToken() as never,
      )

      expect(bridge.request).toHaveBeenCalledWith(
        'completion.complete',
        {
          prefix: 'const x = ',
          suffix: '\nconsole.log(x)',
          language: 'typescript',
          filePath: '/workspace/test.ts',
        },
        5000,
      )
    })

    it('retorna InlineCompletionItem quando bridge retorna texto', async () => {
      const { workspace } = await import('vscode')
      vi.mocked(workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => true),
      } as never)

      const result = await provider.provideInlineCompletionItems(
        createMockDocument() as never,
        createMockPosition() as never,
        {} as never,
        createMockToken() as never,
      )

      expect(result).toHaveLength(1)
      expect((result[0] as { insertText: string }).insertText).toBe('42')
    })

    it('retorna array vazio quando bridge retorna texto vazio', async () => {
      const { workspace } = await import('vscode')
      vi.mocked(workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => true),
      } as never)

      bridge.request = vi.fn(async () => ({ text: '  ' }))

      const result = await provider.provideInlineCompletionItems(
        createMockDocument() as never,
        createMockPosition() as never,
        {} as never,
        createMockToken() as never,
      )

      expect(result).toEqual([])
    })

    it('retorna array vazio quando bridge lanca erro', async () => {
      const { workspace } = await import('vscode')
      vi.mocked(workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => true),
      } as never)

      bridge.request = vi.fn(async () => {
        throw new Error('timeout')
      })

      const result = await provider.provideInlineCompletionItems(
        createMockDocument() as never,
        createMockPosition() as never,
        {} as never,
        createMockToken() as never,
      )

      expect(result).toEqual([])
    })

    it('retorna array vazio se token cancelado apos chamada', async () => {
      const { workspace } = await import('vscode')
      vi.mocked(workspace.getConfiguration).mockReturnValue({
        get: vi.fn(() => true),
      } as never)

      const token = createMockToken(false)
      bridge.request = vi.fn(async () => {
        // Simulate cancellation during request
        token.isCancellationRequested = true
        return { text: 'result' }
      })

      const result = await provider.provideInlineCompletionItems(
        createMockDocument() as never,
        createMockPosition() as never,
        {} as never,
        token as never,
      )

      expect(result).toEqual([])
    })
  })
})
