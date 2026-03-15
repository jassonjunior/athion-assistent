/* eslint-disable @typescript-eslint/no-unused-vars */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let mockOnDidReceiveMessage: (msg: unknown) => void
let mockOnDidDispose: () => void

const mockWebviewPanel = {
  webview: {
    postMessage: vi.fn(),
    onDidReceiveMessage: vi.fn((handler: (msg: unknown) => void) => {
      mockOnDidReceiveMessage = handler
      return { dispose: vi.fn() }
    }),
    asWebviewUri: vi.fn((uri: { fsPath: string }) => uri.fsPath),
    cspSource: 'https://test.csp',
    html: '',
    options: {},
  },
  onDidDispose: vi.fn((handler: () => void) => {
    mockOnDidDispose = handler
    return { dispose: vi.fn() }
  }),
  reveal: vi.fn(),
  dispose: vi.fn(),
}

vi.mock('vscode', () => ({
  window: {
    createWebviewPanel: vi.fn(() => mockWebviewPanel),
    showTextDocument: vi.fn(),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
  },
  Uri: {
    file: vi.fn((p: string) => ({ fsPath: p })),
    joinPath: vi.fn((_base: unknown, ...parts: string[]) => ({
      fsPath: '/ext/' + parts.join('/'),
    })),
  },
  ViewColumn: {
    Beside: 2,
  },
}))

import { DependencyGraphPanel } from './dependency-graph-panel.js'
import * as vscode from 'vscode'

function createMockBridge() {
  return {
    request: vi.fn(async () => ({
      version: 1,
      files: ['a.ts', 'b.ts'],
      edges: [{ from: 'a.ts', to: 'b.ts' }],
      stats: { totalFiles: 2, totalEdges: 1 },
      exportedAt: new Date().toISOString(),
    })),
  }
}

describe('DependencyGraphPanel', () => {
  let bridge: ReturnType<typeof createMockBridge>

  beforeEach(() => {
    vi.clearAllMocks()
    bridge = createMockBridge()
    // Reset singleton by simulating dispose
    // Access the private static instance and reset it
    ;(DependencyGraphPanel as unknown as { instance: undefined }).instance = undefined
  })

  describe('createOrShow', () => {
    it('cria novo painel webview', () => {
      DependencyGraphPanel.createOrShow({ fsPath: '/ext' } as never, bridge as never)

      expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
        'athion.dependencyGraph',
        'Dependency Graph',
        vscode.ViewColumn.Beside,
        expect.objectContaining({
          enableScripts: true,
          retainContextWhenHidden: true,
        }),
      )
    })

    it('configura HTML do webview', () => {
      DependencyGraphPanel.createOrShow({ fsPath: '/ext' } as never, bridge as never)

      expect(mockWebviewPanel.webview.html).toContain('<!DOCTYPE html>')
      expect(mockWebviewPanel.webview.html).toContain('Dependency Graph')
    })

    it('revela painel existente em vez de criar novo', () => {
      DependencyGraphPanel.createOrShow({ fsPath: '/ext' } as never, bridge as never)
      vi.clearAllMocks()

      DependencyGraphPanel.createOrShow({ fsPath: '/ext' } as never, bridge as never)

      expect(vscode.window.createWebviewPanel).not.toHaveBeenCalled()
      expect(mockWebviewPanel.reveal).toHaveBeenCalledWith(vscode.ViewColumn.Beside)
    })

    it('carrega grafo com focusFile quando fornecido', () => {
      DependencyGraphPanel.createOrShow({ fsPath: '/ext' } as never, bridge as never, 'src/main.ts')

      // loadGraph is called internally, which calls bridge.request
      // (async, so we check that postMessage was called with 'loading')
      expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({ type: 'loading' })
    })

    it('carrega grafo quando painel existente recebe focusFile', () => {
      DependencyGraphPanel.createOrShow({ fsPath: '/ext' } as never, bridge as never)
      vi.clearAllMocks()

      DependencyGraphPanel.createOrShow(
        { fsPath: '/ext' } as never,
        bridge as never,
        'src/other.ts',
      )

      expect(mockWebviewPanel.reveal).toHaveBeenCalled()
      expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({ type: 'loading' })
    })
  })

  describe('handleMessage', () => {
    it('abre arquivo quando recebe openFile', () => {
      DependencyGraphPanel.createOrShow({ fsPath: '/ext' } as never, bridge as never)

      mockOnDidReceiveMessage({ type: 'openFile', filePath: 'src/test.ts' })

      expect(vscode.window.showTextDocument).toHaveBeenCalled()
    })

    it('nao abre arquivo se filePath ausente', () => {
      DependencyGraphPanel.createOrShow({ fsPath: '/ext' } as never, bridge as never)

      mockOnDidReceiveMessage({ type: 'openFile' })

      expect(vscode.window.showTextDocument).not.toHaveBeenCalled()
    })

    it('recarrega grafo quando recebe refresh', () => {
      DependencyGraphPanel.createOrShow({ fsPath: '/ext' } as never, bridge as never)
      vi.clearAllMocks()

      mockOnDidReceiveMessage({ type: 'refresh', filePath: 'src/test.ts' })

      expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({ type: 'loading' })
    })

    it('carrega grafo quando recebe ready', () => {
      DependencyGraphPanel.createOrShow({ fsPath: '/ext' } as never, bridge as never)
      vi.clearAllMocks()

      mockOnDidReceiveMessage({ type: 'ready' })

      expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith({ type: 'loading' })
    })
  })

  describe('loadGraph', () => {
    it('envia dados do grafo para o webview', async () => {
      DependencyGraphPanel.createOrShow({ fsPath: '/ext' } as never, bridge as never, 'src/main.ts')

      // Wait for async loadGraph to complete
      await vi.waitFor(() => {
        expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'graphData',
            data: expect.objectContaining({
              files: ['a.ts', 'b.ts'],
            }),
          }),
        )
      })
    })

    it('envia erro quando bridge falha', async () => {
      bridge.request.mockRejectedValueOnce(new Error('bridge error'))

      DependencyGraphPanel.createOrShow({ fsPath: '/ext' } as never, bridge as never, 'src/main.ts')

      await vi.waitFor(() => {
        expect(mockWebviewPanel.webview.postMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'error',
            message: 'bridge error',
          }),
        )
      })
    })
  })

  describe('dispose', () => {
    it('limpa instancia singleton no dispose', () => {
      DependencyGraphPanel.createOrShow({ fsPath: '/ext' } as never, bridge as never)

      mockOnDidDispose()

      // After dispose, createOrShow should create new panel
      vi.clearAllMocks()
      DependencyGraphPanel.createOrShow({ fsPath: '/ext' } as never, bridge as never)

      expect(vscode.window.createWebviewPanel).toHaveBeenCalled()
    })
  })
})
