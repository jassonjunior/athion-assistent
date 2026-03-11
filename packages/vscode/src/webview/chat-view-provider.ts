/**
 * ChatViewProvider — WebviewViewProvider para o painel de chat lateral.
 *
 * Registra na sidebar do VS Code e injeta o bundle React no webview.
 * Conecta o Messenger para comunicação bidirecional com a extensão.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'
import { CoreBridge } from '../bridge/core-bridge.js'
import { ExtensionMessenger } from '../bridge/messenger.js'
import type { ChatEventNotification } from '../bridge/protocol.js'
import type { WebviewToExtension } from '../bridge/messenger-types.js'
import type { AgentInfo } from '../bridge/messenger-types.js'

export class ChatViewProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null
  private messenger: ExtensionMessenger | null = null
  private activeSessionId: string | null = null

  constructor(
    private context: vscode.ExtensionContext,
    private bridge: CoreBridge,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview')],
    }

    webviewView.webview.html = this.getHtml(webviewView.webview)

    // Setup messenger
    this.messenger = new ExtensionMessenger(webviewView.webview)
    this.setupMessageHandlers()

    // Listen for chat events from CoreBridge
    this.bridge.onNotification('chat.event', (params: unknown) => {
      this.messenger?.post({
        type: 'chat:event',
        event: params as ChatEventNotification,
      })
    })

    // Send locale to webview (VSCode language or athion.language setting)
    const config = vscode.workspace.getConfiguration('athion')
    const locale: string = config.get('language') ?? vscode.env.language ?? 'pt-BR'
    this.messenger.post({ type: 'locale:set', locale })

    // Send status to webview
    this.messenger.post({
      type: 'status:update',
      status: this.bridge.ready ? 'ready' : 'starting',
    })

    this.bridge.on('ready', () => {
      this.messenger?.post({ type: 'status:update', status: 'ready' })
    })

    this.bridge.on('exit', () => {
      this.messenger?.post({ type: 'status:update', status: 'stopped' })
    })

    webviewView.onDidDispose(() => {
      this.messenger?.dispose()
      this.messenger = null
      this.view = null
    })
  }

  /** Send a message to the chat programmatically (from commands) */
  async sendMessage(content: string): Promise<void> {
    if (!this.activeSessionId) {
      await this.createSession()
    }
    if (!this.activeSessionId) return

    this.messenger?.post({
      type: 'chat:event',
      event: { type: 'content', content: '' },
    })

    await this.bridge.request('chat.send', {
      sessionId: this.activeSessionId,
      content,
    })
  }

  /** Create a new session and notify webview */
  async createSession(title?: string): Promise<void> {
    try {
      const session = await this.bridge.request<{
        id: string
        projectId: string
        title: string
        createdAt: string
      }>('session.create', {
        projectId: 'vscode',
        title: title ?? 'VS Code Chat',
      })
      this.activeSessionId = session.id
      this.messenger?.post({ type: 'session:active', session })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      vscode.window.showErrorMessage(`Failed to create session: ${msg}`)
    }
  }

  /** Abort current chat */
  async abortChat(): Promise<void> {
    if (!this.activeSessionId) return
    await this.bridge.request('chat.abort', { sessionId: this.activeSessionId })
    this.messenger?.post({ type: 'chat:complete' })
  }

  /** Focus the chat panel */
  focus(): void {
    this.view?.show?.(true)
  }

  // ─── Private ──────────────────────────────────────────────────────

  private setupMessageHandlers(): void {
    if (!this.messenger) return

    this.messenger.on('ready', async () => {
      // Re-send current bridge status (initial post may have been lost before React mounted)
      this.messenger?.post({
        type: 'status:update',
        status: this.bridge.ready ? 'ready' : 'starting',
      })

      if (this.bridge.ready) {
        // Bridge already up — create session immediately
        await this.createSession()
      } else {
        // Bridge still starting — wait for it to be ready before creating session
        const onReady = async () => {
          this.bridge.off('ready', onReady)
          await this.createSession()
        }
        this.bridge.on('ready', onReady)
      }
    })

    this.messenger.on(
      'chat:send',
      async (msg: Extract<WebviewToExtension, { type: 'chat:send' }>) => {
        if (!this.activeSessionId) {
          await this.createSession()
        }
        if (!this.activeSessionId) return

        // Resolver @mentions com conteúdo de arquivos antes de enviar ao bridge
        const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
        const resolvedContent = resolveAtMentions(msg.content, wsRoot)

        await this.bridge.request(
          'chat.send',
          {
            sessionId: this.activeSessionId,
            content: resolvedContent,
          },
          300000,
        ) // 5 min — AI responses with tool calls can take a while

        this.messenger?.post({ type: 'chat:complete' })
      },
    )

    this.messenger.on('chat:abort', async () => {
      await this.abortChat()
    })

    this.messenger.on(
      'session:create',
      async (msg: Extract<WebviewToExtension, { type: 'session:create' }>) => {
        await this.createSession(msg.title)
      },
    )

    this.messenger.on('session:list', async () => {
      try {
        const sessions = await this.bridge.request<
          Array<{
            id: string
            projectId: string
            title: string
            createdAt: string
          }>
        >('session.list', { projectId: 'vscode' })
        this.messenger?.post({ type: 'session:list:result', sessions })
      } catch {
        this.messenger?.post({ type: 'session:list:result', sessions: [] })
      }
    })

    this.messenger.on(
      'session:select',
      async (msg: Extract<WebviewToExtension, { type: 'session:select' }>) => {
        try {
          const session = await this.bridge.request<{
            id: string
            projectId: string
            title: string
            createdAt: string
          }>('session.load', { sessionId: msg.id })
          this.activeSessionId = session.id
          this.messenger?.post({ type: 'session:active', session })
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          vscode.window.showErrorMessage(`Failed to load session: ${errMsg}`)
        }
      },
    )

    this.messenger.on('config:list', async () => {
      try {
        const config = await this.bridge.request<Record<string, unknown>>('config.list')
        this.messenger?.post({ type: 'config:result', config })
      } catch {
        this.messenger?.post({ type: 'config:result', config: {} })
      }
    })

    // Codebase handlers
    this.messenger.on('codebase:index', async () => {
      try {
        const result = await this.bridge.request<{ totalFiles: number; totalChunks: number }>(
          'codebase.index',
          {},
          300000,
        )
        this.messenger?.post({
          type: 'codebase:indexed',
          totalFiles: result.totalFiles,
          totalChunks: result.totalChunks,
        })
      } catch (err) {
        this.messenger?.post({
          type: 'codebase:error',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    })

    this.messenger.on(
      'codebase:search',
      async (
        msg: Extract<
          import('../bridge/messenger-types.js').WebviewToExtension,
          { type: 'codebase:search' }
        >,
      ) => {
        try {
          const result = await this.bridge.request<{
            results: import('../bridge/messenger-types.js').CodebaseSearchResult[]
          }>('codebase.search', { query: msg.query, limit: msg.limit ?? 8 }, 30000)
          this.messenger?.post({
            type: 'codebase:result',
            results: result.results,
            query: msg.query,
          })
        } catch (err) {
          this.messenger?.post({
            type: 'codebase:error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      },
    )

    this.messenger.on(
      'skill:setActive',
      async (
        msg: Extract<
          import('../bridge/messenger-types.js').WebviewToExtension,
          { type: 'skill:setActive' }
        >,
      ) => {
        try {
          await this.bridge.request('skill.setActive', { name: msg.name })
          this.messenger?.post({ type: 'skill:active', name: msg.name })
        } catch {
          /* silencioso */
        }
      },
    )

    this.messenger.on('skill:clearActive', async () => {
      try {
        await this.bridge.request('skill.clearActive', {})
        this.messenger?.post({ type: 'skill:active', name: null })
      } catch {
        /* silencioso */
      }
    })

    this.messenger.on('skill:list', async () => {
      try {
        const skills = await this.bridge.request<
          import('../bridge/messenger-types.js').SkillInfo[]
        >('skill.list', {})
        this.messenger?.post({ type: 'skill:list:result', skills })
      } catch {
        this.messenger?.post({ type: 'skill:list:result', skills: [] })
      }
    })

    this.messenger.on(
      'files:list',
      async (
        msg: Extract<
          import('../bridge/messenger-types.js').WebviewToExtension,
          { type: 'files:list' }
        >,
      ) => {
        try {
          const result = await this.bridge.request<{ files: string[] }>(
            'files.list',
            { prefix: msg.prefix },
            10000,
          )
          this.messenger?.post({
            type: 'files:list:result',
            files: result.files,
            prefix: msg.prefix,
          })
        } catch {
          this.messenger?.post({ type: 'files:list:result', files: [], prefix: msg.prefix })
        }
      },
    )

    this.messenger.on(
      'skills:find',
      async (
        msg: Extract<
          import('../bridge/messenger-types.js').WebviewToExtension,
          { type: 'skills:find' }
        >,
      ) => {
        try {
          const result = await this.bridge.request<{
            results: import('../bridge/messenger-types.js').SkillSearchResult[]
          }>('plugin.search', { query: msg.query }, 30000)
          this.messenger?.post({ type: 'skills:found', results: result.results, query: msg.query })
        } catch {
          this.messenger?.post({ type: 'skills:found', results: [], query: msg.query })
        }
      },
    )

    this.messenger.on(
      'skills:install',
      async (
        msg: Extract<
          import('../bridge/messenger-types.js').WebviewToExtension,
          { type: 'skills:install' }
        >,
      ) => {
        try {
          const result = await this.bridge.request<{ success: boolean; error?: string }>(
            'plugin.install',
            { name: msg.name },
            60000,
          )
          this.messenger?.post({
            type: 'skills:installed',
            name: msg.name,
            success: result.success,
            error: result.error,
          })
        } catch (err) {
          this.messenger?.post({
            type: 'skills:installed',
            name: msg.name,
            success: false,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      },
    )

    this.messenger.on(
      'mention:search',
      async (
        msg: Extract<
          import('../bridge/messenger-types.js').WebviewToExtension,
          { type: 'mention:search' }
        >,
      ) => {
        try {
          const result = await this.bridge.request<{
            results: import('../bridge/messenger-types.js').MentionResult[]
          }>('codebase.search', { query: msg.query, limit: 8 }, 10000)
          this.messenger?.post({
            type: 'mention:results',
            results: result.results,
            query: msg.query,
          })
        } catch {
          // Silencioso: dropdown simplesmente não abre se indexer indisponível
          this.messenger?.post({ type: 'mention:results', results: [], query: msg.query })
        }
      },
    )

    this.messenger.on('agents:list', async () => {
      try {
        const agents = await this.bridge.request<AgentInfo[]>('agents.list')
        this.messenger?.post({ type: 'agents:list:result', agents })
      } catch {
        this.messenger?.post({ type: 'agents:list:result', agents: [] })
      }
    })
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.js'),
    )
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'main.css'),
    )
    const nonce = getNonce()

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src ${webview.cspSource};">
  <link rel="stylesheet" href="${styleUri}">
  <title>Athion Chat</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }
}

function resolveAtMentions(content: string, wsRoot: string | undefined): string {
  if (!wsRoot || !content.includes('@')) return content
  return content.replace(/@([\w./-]+)/g, (_match, filePath: string) => {
    const resolved = path.isAbsolute(filePath) ? filePath : path.resolve(wsRoot, filePath)
    if (!fs.existsSync(resolved)) return `@${filePath} (arquivo não encontrado)`
    try {
      const fileContent = fs.readFileSync(resolved, 'utf-8')
      const lines = fileContent.split('\n')
      const truncated =
        lines.length > 200
          ? lines.slice(0, 200).join('\n') + `\n... (${lines.length - 200} linhas omitidas)`
          : fileContent
      return `[Conteúdo de ${filePath}]:\n\`\`\`\n${truncated}\n\`\`\``
    } catch {
      return `@${filePath} (erro ao ler)`
    }
  })
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 32; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}
