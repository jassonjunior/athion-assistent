/**
 * Registro de todos os comandos da extensão.
 *
 * Cada comando é registrado via vscode.commands.registerCommand
 * e adicionado ao context.subscriptions para cleanup automático.
 */

import * as vscode from 'vscode'
import type { CoreBridge } from '../bridge/core-bridge.js'
import type { ChatViewProvider } from '../webview/chat-view-provider.js'
import type { DiffManager } from '../diff/diff-manager.js'
import { getSelectionContext } from '../context/selection-context.js'

type CommandEntry = [string, (...args: unknown[]) => unknown]

export function registerCommands(
  context: vscode.ExtensionContext,
  _bridge: CoreBridge,
  chatProvider: ChatViewProvider,
  diffManager: DiffManager,
): void {
  const commands: CommandEntry[] = [
    ...chatCommands(chatProvider),
    ...codeCommands(chatProvider),
    ...inlineCommands(),
    ...diffCommands(diffManager),
    ...settingsCommands(),
  ]

  for (const [id, handler] of commands) {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler))
  }
}

function chatCommands(chatProvider: ChatViewProvider): CommandEntry[] {
  return [
    [
      'athion.newChat',
      async () => {
        await chatProvider.createSession()
        chatProvider.focus()
      },
    ],
    [
      'athion.abortChat',
      async () => {
        await chatProvider.abortChat()
      },
    ],
    [
      'athion.focusChat',
      () => {
        chatProvider.focus()
      },
    ],
  ]
}

function codeCommands(chatProvider: ChatViewProvider): CommandEntry[] {
  return [
    ['athion.explainCode', () => sendCodeCommand(chatProvider, 'Explique este código')],
    [
      'athion.reviewCode',
      () =>
        sendCodeCommand(
          chatProvider,
          'Revise este código buscando bugs, problemas de segurança e melhorias',
        ),
    ],
    [
      'athion.refactorCode',
      () => sendCodeCommand(chatProvider, 'Refatore este código mantendo o comportamento'),
    ],
    [
      'athion.generateTests',
      () => sendCodeCommand(chatProvider, 'Gere testes unitários para este código'),
    ],
    ['athion.fixBug', () => sendFixBugCommand(chatProvider)],
  ]
}

function inlineCommands(): CommandEntry[] {
  return [
    [
      'athion.toggleInline',
      () => {
        const config = vscode.workspace.getConfiguration('athion')
        const current = config.get<boolean>('inlineEnabled', true)
        config.update('inlineEnabled', !current, vscode.ConfigurationTarget.Global)
        vscode.window.showInformationMessage(`Athion Inline: ${!current ? 'Enabled' : 'Disabled'}`)
      },
    ],
  ]
}

function diffCommands(diffManager: DiffManager): CommandEntry[] {
  return [
    ['athion.acceptDiff', () => diffManager.acceptCurrent()],
    ['athion.rejectDiff', () => diffManager.rejectCurrent()],
    ['athion.acceptAllDiffs', () => diffManager.acceptAll()],
    ['athion.rejectAllDiffs', () => diffManager.rejectAll()],
  ]
}

function settingsCommands(): CommandEntry[] {
  return [
    [
      'athion.openSettings',
      () => {
        vscode.commands.executeCommand(
          'workbench.action.openSettings',
          '@ext:athion.athion-assistent',
        )
      },
    ],
  ]
}

// ─── Helpers ─────────────────────────────────────────────────────────

async function sendCodeCommand(chatProvider: ChatViewProvider, instruction: string): Promise<void> {
  const ctx = getSelectionContext()
  if (!ctx) return
  chatProvider.focus()
  await chatProvider.sendMessage(
    `${instruction} (${ctx.language}, ${ctx.filePath}:${ctx.startLine}):\n\n\`\`\`${ctx.language}\n${ctx.text}\n\`\`\``,
  )
}

async function sendFixBugCommand(chatProvider: ChatViewProvider): Promise<void> {
  const ctx = getSelectionContext()
  if (!ctx) return

  const editor = vscode.window.activeTextEditor
  const diagnostics = editor
    ? vscode.languages
        .getDiagnostics(editor.document.uri)
        .filter(
          (d) =>
            d.severity === vscode.DiagnosticSeverity.Error ||
            d.severity === vscode.DiagnosticSeverity.Warning,
        )
        .map((d) => `${d.source}: ${d.message} (line ${d.range.start.line + 1})`)
    : []

  const diagnosticInfo =
    diagnostics.length > 0 ? `\n\nDiagnósticos:\n${diagnostics.join('\n')}` : ''

  chatProvider.focus()
  await chatProvider.sendMessage(
    `Corrija o bug neste código (${ctx.language}, ${ctx.filePath}:${ctx.startLine}):${diagnosticInfo}\n\n\`\`\`${ctx.language}\n${ctx.text}\n\`\`\``,
  )
}
