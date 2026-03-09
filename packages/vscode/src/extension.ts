/**
 * Extension entry point — activate/deactivate.
 *
 * activate(): Inicializa CoreBridge (child process Bun), registra comandos,
 * cria WebviewViewProvider para o chat lateral.
 *
 * deactivate(): Mata o child process e limpa recursos.
 */

import * as vscode from 'vscode'
import { CoreBridge } from './bridge/core-bridge.js'
import { ChatViewProvider } from './webview/chat-view-provider.js'
import { registerCommands } from './commands/index.js'
import { InlineProvider } from './completion/inline-provider.js'
import { DiffManager } from './diff/diff-manager.js'

let bridge: CoreBridge | null = null
let outputChannel: vscode.OutputChannel

export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Athion')
  outputChannel.appendLine('Athion Assistent activating...')

  // ─── CoreBridge (child process Bun) ─────────────────────────────

  const config = vscode.workspace.getConfiguration('athion')
  const bunPath = config.get<string>('bunPath', 'bun')

  bridge = new CoreBridge({
    bunPath,
    extensionPath: context.extensionPath,
  })

  bridge.on('log', (...args: unknown[]) => {
    outputChannel.appendLine(`[core] ${args[0]}`)
  })

  bridge.on('error', (...args: unknown[]) => {
    const err = args[0] as Error
    outputChannel.appendLine(`[core] ERROR: ${err.message}`)
    vscode.window.showErrorMessage(`Athion Core: ${err.message}`)
  })

  bridge.on('exit', (...args: unknown[]) => {
    outputChannel.appendLine(`[core] Process exited (code=${args[0]})`)
  })

  // Start bridge in background — don't block activation
  bridge.start().then(
    () => {
      outputChannel.appendLine('[core] Ready')
      vscode.window.setStatusBarMessage('Athion: Ready', 3000)
    },
    (err: Error) => {
      outputChannel.appendLine(`[core] Failed to start: ${err.message}`)
      vscode.window.showWarningMessage(
        `Athion: Could not start core. Make sure Bun is installed. Error: ${err.message}`,
      )
    },
  )

  // ─── Chat Webview ───────────────────────────────────────────────

  const chatProvider = new ChatViewProvider(context, bridge)
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('athion.chat', chatProvider))

  // ─── Diff Manager ──────────────────────────────────────────────

  const diffManager = new DiffManager()
  context.subscriptions.push(diffManager)

  // ─── Inline Completion ─────────────────────────────────────────

  const inlineProvider = new InlineProvider(bridge)
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, inlineProvider),
  )

  // ─── Commands ──────────────────────────────────────────────────

  registerCommands(context, bridge, chatProvider, diffManager)

  // ─── Cleanup ───────────────────────────────────────────────────

  context.subscriptions.push({
    dispose() {
      bridge?.stop()
      bridge = null
    },
  })

  outputChannel.appendLine('Athion Assistent activated')
}

export function deactivate() {
  bridge?.stop()
  bridge = null
}
