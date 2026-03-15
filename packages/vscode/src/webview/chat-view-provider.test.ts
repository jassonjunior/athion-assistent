import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => true),
  readFileSync: vi.fn(() => 'file content line 1\nline 2\nline 3'),
}))

vi.mock('node:path', () => ({
  isAbsolute: vi.fn((p: string) => p.startsWith('/')),
  resolve: vi.fn((...parts: string[]) => parts.join('/')),
}))

const mockWebview = {
  postMessage: vi.fn(),
  onDidReceiveMessage: vi.fn((_handler: unknown) => ({ dispose: vi.fn() })),
  asWebviewUri: vi.fn((uri: { fsPath: string }) => uri.fsPath),
  cspSource: 'https://test.csp',
  options: {},
}

const mockWebviewView = {
  webview: mockWebview,
  onDidDispose: vi.fn(),
  show: vi.fn(),
}

vi.mock('vscode', () => ({
  Uri: {
    joinPath: vi.fn((_base: unknown, ...parts: string[]) => ({
      fsPath: '/ext/' + parts.join('/'),
    })),
    file: vi.fn((p: string) => ({ fsPath: p })),
  },
  window: {
    showErrorMessage: vi.fn(),
    showWarningMessage: vi.fn(),
  },
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((_key: string) => 'pt-BR'),
    })),
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
  },
  env: {
    language: 'pt-BR',
  },
}))

vi.mock('../bridge/messenger.js', () => ({
  ExtensionMessenger: vi.fn().mockImplementation(() => ({
    post: vi.fn(),
    on: vi.fn(),
    onAny: vi.fn(),
    dispose: vi.fn(),
  })),
}))

import { ChatViewProvider } from './chat-view-provider.js'
import { ExtensionMessenger } from '../bridge/messenger.js'

function createMockContext() {
  return {
    extensionUri: { fsPath: '/ext' },
    subscriptions: [],
  }
}

function createMockBridge() {
  return {
    ready: true,
    request: vi.fn(async () => ({
      id: 'session-1',
      projectId: 'vscode',
      title: 'VS Code Chat',
      createdAt: new Date().toISOString(),
    })),
    on: vi.fn(),
    off: vi.fn(),
    onNotification: vi.fn(),
    offNotification: vi.fn(),
  }
}

describe('ChatViewProvider', () => {
  let provider: ChatViewProvider
  let bridge: ReturnType<typeof createMockBridge>
  let context: ReturnType<typeof createMockContext>

  beforeEach(() => {
    vi.clearAllMocks()
    context = createMockContext()
    bridge = createMockBridge()
    provider = new ChatViewProvider(context as never, bridge as never)
  })

  describe('resolveWebviewView', () => {
    it('configura webview com scripts habilitados', () => {
      provider.resolveWebviewView(mockWebviewView as never, {} as never, {} as never)

      expect(mockWebviewView.webview.options).toEqual(
        expect.objectContaining({
          enableScripts: true,
        }),
      )
    })

    it('cria ExtensionMessenger com o webview', () => {
      provider.resolveWebviewView(mockWebviewView as never, {} as never, {} as never)

      expect(ExtensionMessenger).toHaveBeenCalledWith(mockWebviewView.webview)
    })

    it('configura o HTML do webview', () => {
      provider.resolveWebviewView(mockWebviewView as never, {} as never, {} as never)

      expect(mockWebviewView.webview).toHaveProperty('html')
      expect(typeof (mockWebviewView.webview as { html?: string }).html).toBe('string')
    })

    it('registra listeners de eventos do bridge', () => {
      provider.resolveWebviewView(mockWebviewView as never, {} as never, {} as never)

      expect(bridge.onNotification).toHaveBeenCalledWith('chat.event', expect.any(Function))
      expect(bridge.on).toHaveBeenCalledWith('ready', expect.any(Function))
      expect(bridge.on).toHaveBeenCalledWith('exit', expect.any(Function))
    })

    it('registra handler de dispose', () => {
      provider.resolveWebviewView(mockWebviewView as never, {} as never, {} as never)

      expect(mockWebviewView.onDidDispose).toHaveBeenCalledWith(expect.any(Function))
    })
  })

  describe('sendMessage', () => {
    it('cria sessao automaticamente se nao existir', async () => {
      provider.resolveWebviewView(mockWebviewView as never, {} as never, {} as never)

      await provider.sendMessage('hello')

      expect(bridge.request).toHaveBeenCalledWith(
        'session.create',
        expect.objectContaining({ projectId: 'vscode' }),
      )
    })

    it('envia mensagem ao bridge com sessionId', async () => {
      provider.resolveWebviewView(mockWebviewView as never, {} as never, {} as never)

      await provider.sendMessage('hello')

      expect(bridge.request).toHaveBeenCalledWith(
        'chat.send',
        expect.objectContaining({
          sessionId: 'session-1',
          content: 'hello',
        }),
      )
    })
  })

  describe('createSession', () => {
    it('cria sessao com titulo padrao', async () => {
      provider.resolveWebviewView(mockWebviewView as never, {} as never, {} as never)

      await provider.createSession()

      expect(bridge.request).toHaveBeenCalledWith('session.create', {
        projectId: 'vscode',
        title: 'VS Code Chat',
      })
    })

    it('cria sessao com titulo customizado', async () => {
      provider.resolveWebviewView(mockWebviewView as never, {} as never, {} as never)

      await provider.createSession('Custom Title')

      expect(bridge.request).toHaveBeenCalledWith('session.create', {
        projectId: 'vscode',
        title: 'Custom Title',
      })
    })

    it('mostra erro quando criacao falha', async () => {
      bridge.request.mockRejectedValueOnce(new Error('creation failed'))
      const { window } = await import('vscode')

      provider.resolveWebviewView(mockWebviewView as never, {} as never, {} as never)

      await provider.createSession()

      expect(window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('creation failed'),
      )
    })
  })

  describe('abortChat', () => {
    it('nao faz nada se nao ha sessao ativa', async () => {
      await provider.abortChat()

      expect(bridge.request).not.toHaveBeenCalledWith('chat.abort', expect.anything())
    })

    it('envia abort ao bridge com sessionId', async () => {
      provider.resolveWebviewView(mockWebviewView as never, {} as never, {} as never)

      await provider.createSession()
      vi.clearAllMocks()

      await provider.abortChat()

      expect(bridge.request).toHaveBeenCalledWith('chat.abort', {
        sessionId: 'session-1',
      })
    })
  })

  describe('focus', () => {
    it('mostra a view quando disponivel', () => {
      provider.resolveWebviewView(mockWebviewView as never, {} as never, {} as never)

      provider.focus()

      expect(mockWebviewView.show).toHaveBeenCalledWith(true)
    })

    it('nao lanca erro se view nao disponivel', () => {
      expect(() => provider.focus()).not.toThrow()
    })
  })
})
