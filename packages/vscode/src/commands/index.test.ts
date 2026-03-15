import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('vscode', () => ({
  commands: {
    registerCommand: vi.fn((_id: string, handler: unknown) => ({
      dispose: vi.fn(),
      _handler: handler,
    })),
    executeCommand: vi.fn(),
  },
  window: {
    activeTextEditor: {
      document: {
        uri: { fsPath: '/workspace/src/test.ts' },
        languageId: 'typescript',
        getText: vi.fn(() => 'selected code'),
      },
      selection: {
        active: { line: 5 },
        start: { line: 5 },
        end: { line: 10 },
      },
    },
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showErrorMessage: vi.fn(),
    showInputBox: vi.fn(),
    withProgress: vi.fn(async (_options: unknown, task: (progress: unknown) => Promise<void>) => {
      await task({ report: vi.fn() })
    }),
    showTextDocument: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string, def: unknown) => def),
      update: vi.fn(),
    })),
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    getWorkspaceFolder: vi.fn(() => ({ uri: { fsPath: '/workspace' } })),
    asRelativePath: vi.fn(() => 'src/test.ts'),
  },
  languages: {
    getDiagnostics: vi.fn(() => []),
  },
  ConfigurationTarget: {
    Global: 1,
  },
  ProgressLocation: {
    Notification: 15,
  },
  DiagnosticSeverity: {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3,
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

vi.mock('../context/selection-context.js', () => ({
  getSelectionContext: vi.fn(() => ({
    text: 'selected code',
    language: 'typescript',
    filePath: 'src/test.ts',
    startLine: 6,
    endLine: 11,
  })),
}))

vi.mock('../panels/dependency-graph-panel.js', () => ({
  DependencyGraphPanel: {
    createOrShow: vi.fn(),
  },
}))

import { registerCommands } from './index.js'
import * as vscode from 'vscode'
import { getSelectionContext } from '../context/selection-context.js'
import { DependencyGraphPanel } from '../panels/dependency-graph-panel.js'

function createMockContext() {
  return {
    extensionUri: { fsPath: '/ext' },
    subscriptions: [] as Array<{ dispose: () => void }>,
  }
}

function createMockBridge() {
  return {
    ready: true,
    request: vi.fn(async () => ({ totalFiles: 10, totalChunks: 50 })),
    on: vi.fn(),
    off: vi.fn(),
    onNotification: vi.fn(),
  }
}

function createMockChatProvider() {
  return {
    createSession: vi.fn(async () => {}),
    abortChat: vi.fn(async () => {}),
    focus: vi.fn(),
    sendMessage: vi.fn(async () => {}),
  }
}

function createMockDiffManager() {
  return {
    acceptCurrent: vi.fn(),
    rejectCurrent: vi.fn(),
    acceptAll: vi.fn(),
    rejectAll: vi.fn(),
  }
}

describe('registerCommands', () => {
  let context: ReturnType<typeof createMockContext>
  let bridge: ReturnType<typeof createMockBridge>
  let chatProvider: ReturnType<typeof createMockChatProvider>
  let diffManager: ReturnType<typeof createMockDiffManager>

  beforeEach(() => {
    vi.clearAllMocks()
    context = createMockContext()
    bridge = createMockBridge()
    chatProvider = createMockChatProvider()
    diffManager = createMockDiffManager()
  })

  it('registra todos os comandos no VS Code', () => {
    registerCommands(context as never, bridge as never, chatProvider as never, diffManager as never)

    const registeredIds = vi.mocked(vscode.commands.registerCommand).mock.calls.map((c) => c[0])

    expect(registeredIds).toContain('athion.newChat')
    expect(registeredIds).toContain('athion.abortChat')
    expect(registeredIds).toContain('athion.focusChat')
    expect(registeredIds).toContain('athion.explainCode')
    expect(registeredIds).toContain('athion.reviewCode')
    expect(registeredIds).toContain('athion.refactorCode')
    expect(registeredIds).toContain('athion.generateTests')
    expect(registeredIds).toContain('athion.fixBug')
    expect(registeredIds).toContain('athion.toggleInline')
    expect(registeredIds).toContain('athion.acceptDiff')
    expect(registeredIds).toContain('athion.rejectDiff')
    expect(registeredIds).toContain('athion.acceptAllDiffs')
    expect(registeredIds).toContain('athion.rejectAllDiffs')
    expect(registeredIds).toContain('athion.openSettings')
    expect(registeredIds).toContain('athion.indexCodebase')
    expect(registeredIds).toContain('athion.searchCodebase')
    expect(registeredIds).toContain('athion.showDependencyGraph')
  })

  it('adiciona todos os disposables ao context.subscriptions', () => {
    registerCommands(context as never, bridge as never, chatProvider as never, diffManager as never)

    expect(context.subscriptions.length).toBeGreaterThan(0)
    expect(context.subscriptions.length).toBe(
      vi.mocked(vscode.commands.registerCommand).mock.calls.length,
    )
  })

  describe('chat commands', () => {
    it('athion.newChat cria sessao e foca', async () => {
      registerCommands(
        context as never,
        bridge as never,
        chatProvider as never,
        diffManager as never,
      )

      const handler = getCommandHandler('athion.newChat')
      await handler()

      expect(chatProvider.createSession).toHaveBeenCalled()
      expect(chatProvider.focus).toHaveBeenCalled()
    })

    it('athion.abortChat aborta o chat', async () => {
      registerCommands(
        context as never,
        bridge as never,
        chatProvider as never,
        diffManager as never,
      )

      const handler = getCommandHandler('athion.abortChat')
      await handler()

      expect(chatProvider.abortChat).toHaveBeenCalled()
    })

    it('athion.focusChat foca o chat', () => {
      registerCommands(
        context as never,
        bridge as never,
        chatProvider as never,
        diffManager as never,
      )

      const handler = getCommandHandler('athion.focusChat')
      handler()

      expect(chatProvider.focus).toHaveBeenCalled()
    })
  })

  describe('code commands', () => {
    it('athion.explainCode envia comando de explicacao', async () => {
      registerCommands(
        context as never,
        bridge as never,
        chatProvider as never,
        diffManager as never,
      )

      const handler = getCommandHandler('athion.explainCode')
      await handler()

      expect(chatProvider.focus).toHaveBeenCalled()
      expect(chatProvider.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Explique este código'),
      )
    })

    it('athion.explainCode nao envia se nao ha selecao', async () => {
      vi.mocked(getSelectionContext).mockReturnValueOnce(null)

      registerCommands(
        context as never,
        bridge as never,
        chatProvider as never,
        diffManager as never,
      )

      const handler = getCommandHandler('athion.explainCode')
      await handler()

      expect(chatProvider.sendMessage).not.toHaveBeenCalled()
    })

    it('athion.generateTests envia comando de testes', async () => {
      registerCommands(
        context as never,
        bridge as never,
        chatProvider as never,
        diffManager as never,
      )

      const handler = getCommandHandler('athion.generateTests')
      await handler()

      expect(chatProvider.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining('Gere testes unitários'),
      )
    })
  })

  describe('inline commands', () => {
    it('athion.toggleInline alterna inlineEnabled e mostra mensagem', () => {
      const mockUpdate = vi.fn()
      vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((_key: string, def: unknown) => def),
        update: mockUpdate,
      } as never)

      registerCommands(
        context as never,
        bridge as never,
        chatProvider as never,
        diffManager as never,
      )

      const handler = getCommandHandler('athion.toggleInline')
      handler()

      expect(mockUpdate).toHaveBeenCalledWith('inlineEnabled', false, 1) // ConfigurationTarget.Global = 1
      expect(vscode.window.showInformationMessage).toHaveBeenCalled()
    })
  })

  describe('diff commands', () => {
    it('athion.acceptDiff chama diffManager.acceptCurrent', () => {
      registerCommands(
        context as never,
        bridge as never,
        chatProvider as never,
        diffManager as never,
      )

      const handler = getCommandHandler('athion.acceptDiff')
      handler()

      expect(diffManager.acceptCurrent).toHaveBeenCalled()
    })

    it('athion.rejectDiff chama diffManager.rejectCurrent', () => {
      registerCommands(
        context as never,
        bridge as never,
        chatProvider as never,
        diffManager as never,
      )

      const handler = getCommandHandler('athion.rejectDiff')
      handler()

      expect(diffManager.rejectCurrent).toHaveBeenCalled()
    })

    it('athion.acceptAllDiffs chama diffManager.acceptAll', () => {
      registerCommands(
        context as never,
        bridge as never,
        chatProvider as never,
        diffManager as never,
      )

      const handler = getCommandHandler('athion.acceptAllDiffs')
      handler()

      expect(diffManager.acceptAll).toHaveBeenCalled()
    })

    it('athion.rejectAllDiffs chama diffManager.rejectAll', () => {
      registerCommands(
        context as never,
        bridge as never,
        chatProvider as never,
        diffManager as never,
      )

      const handler = getCommandHandler('athion.rejectAllDiffs')
      handler()

      expect(diffManager.rejectAll).toHaveBeenCalled()
    })
  })

  describe('settings commands', () => {
    it('athion.openSettings abre configuracoes da extensao', () => {
      registerCommands(
        context as never,
        bridge as never,
        chatProvider as never,
        diffManager as never,
      )

      const handler = getCommandHandler('athion.openSettings')
      handler()

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'workbench.action.openSettings',
        '@ext:athion.athion-assistent',
      )
    })
  })

  describe('codebase commands', () => {
    it('athion.indexCodebase indexa com progresso', async () => {
      registerCommands(
        context as never,
        bridge as never,
        chatProvider as never,
        diffManager as never,
      )

      const handler = getCommandHandler('athion.indexCodebase')
      await handler()

      expect(vscode.window.withProgress).toHaveBeenCalled()
      expect(bridge.request).toHaveBeenCalledWith('codebase.index', {}, 300000)
    })

    it('athion.searchCodebase mostra input e busca', async () => {
      vi.mocked(vscode.window.showInputBox).mockResolvedValue('auth function')
      bridge.request.mockResolvedValueOnce({
        results: [{ file: 'auth.ts', startLine: 1, score: 0.95 }],
      })

      registerCommands(
        context as never,
        bridge as never,
        chatProvider as never,
        diffManager as never,
      )

      const handler = getCommandHandler('athion.searchCodebase')
      await handler()

      expect(vscode.window.showInputBox).toHaveBeenCalled()
    })
  })

  describe('graph commands', () => {
    it('athion.showDependencyGraph abre painel de grafo', () => {
      registerCommands(
        context as never,
        bridge as never,
        chatProvider as never,
        diffManager as never,
      )

      const handler = getCommandHandler('athion.showDependencyGraph')
      handler()

      expect(DependencyGraphPanel.createOrShow).toHaveBeenCalled()
    })
  })
})

// Helper to get command handler by ID
function getCommandHandler(id: string): (...args: unknown[]) => unknown {
  const calls = vi.mocked(vscode.commands.registerCommand).mock.calls
  const match = calls.find((c) => c[0] === id)
  if (!match) throw new Error(`Command ${id} not registered`)
  return match[1] as (...args: unknown[]) => unknown
}
