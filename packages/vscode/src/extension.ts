/**
 * extension
 * Descrição: Ponto de entrada da extensão VS Code (activate/deactivate).
 * activate(): Inicializa CoreBridge (child process Bun), registra comandos,
 * cria WebviewViewProvider para o chat lateral e InlineProvider para completions.
 * deactivate(): Mata o child process e limpa recursos.
 */

import * as vscode from 'vscode'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { CoreBridge } from './bridge/core-bridge.js'
import { ChatViewProvider } from './webview/chat-view-provider.js'
import { registerCommands } from './commands/index.js'
import { InlineProvider } from './completion/inline-provider.js'
import { DiffManager } from './diff/diff-manager.js'

/** bridge - Instância global do CoreBridge (child process Bun) */
let bridge: CoreBridge | null = null
/** outputChannel - Canal de saída para logs da extensão */
let outputChannel: vscode.OutputChannel

/**
 * activate
 * Descrição: Ativa a extensão, inicializando o CoreBridge, registrando comandos,
 * criando o ChatViewProvider, DiffManager e InlineProvider.
 * @param context - Contexto da extensão VS Code com subscriptions e extensionPath
 * @returns Promise que resolve quando a ativação está completa
 */
export async function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('Athion')
  outputChannel.appendLine('Athion Assistent activating...')

  // ─── CoreBridge (child process Bun) ─────────────────────────────

  const config = vscode.workspace.getConfiguration('athion')
  const bunPath = config.get<string>('bunPath', 'bun')
  const cliPathConfig = config.get<string>('cliPath', '')

  const cliPath = cliPathConfig || detectCliPath(context.extensionPath)
  if (cliPath) {
    outputChannel.appendLine(`[core] CLI path: ${cliPath}`)
  } else {
    outputChannel.appendLine('[core] CLI path not found — using global athion binary')
  }

  bridge = new CoreBridge({
    bunPath,
    cliPath,
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

/**
 * deactivate
 * Descrição: Desativa a extensão, parando o CoreBridge e liberando recursos.
 * @returns void
 */
export function deactivate() {
  bridge?.stop()
  bridge = null
}

/**
 * detectCliPath
 * Descrição: Detecta o caminho do CLI dist/index.js procurando em locais comuns:
 * 1. Workspace root (monorepo aberto no VS Code)
 * 2. Diretório irmão da extensão (dev mode)
 * 3. Dois níveis acima do extensionPath (fallback para dev)
 * @param extensionPath - Caminho absoluto do diretório da extensão
 * @returns Caminho do CLI encontrado ou undefined (CoreBridge usará global `athion`)
 */
function detectCliPath(extensionPath: string): string | undefined {
  const candidates: string[] = []

  // 1. Workspace root
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (wsRoot) {
    candidates.push(resolve(wsRoot, 'packages', 'cli', 'dist', 'index.js'))
  }

  // 2. Extensão instalada dentro do monorepo (dev mode: packages/vscode)
  candidates.push(resolve(extensionPath, '..', 'cli', 'dist', 'index.js'))
  // 3. Dois níveis acima (fallback)
  candidates.push(resolve(extensionPath, '..', '..', 'packages', 'cli', 'dist', 'index.js'))

  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return undefined
}
