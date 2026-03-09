/**
 * VS Code E2E Fixtures — helpers para testes com wdio-vscode-service.
 *
 * Abstrai operações comuns no VS Code via WebdriverIO:
 *   - abrir a sidebar do Athion
 *   - executar comandos
 *   - interagir com o webview de chat
 *   - aguardar extensão ficar pronta
 */

/** Abre a sidebar do Athion no activity bar. */
export async function openAthionSidebar(): Promise<void> {
  await browser.executeWorkbench((vscode) => {
    return vscode.commands.executeCommand('workbench.view.extension.athion')
  })
  await browser.pause(1000)
}

/** Aguarda a extensão Athion terminar de ativar. */
export async function waitForExtensionReady(timeoutMs = 30000): Promise<void> {
  await browser.waitUntil(
    async () => {
      try {
        const result = await browser.executeWorkbench((vscode) => {
          const ext = vscode.extensions.getExtension('athion.athion-assistent')
          return ext?.isActive ?? false
        })
        return result === true
      } catch {
        return false
      }
    },
    { timeout: timeoutMs, interval: 500, timeoutMsg: 'Athion extension did not activate in time' },
  )
}

/** Executa um comando do VS Code via API. */
export async function executeAthionCommand(command: string): Promise<void> {
  await browser.executeWorkbench((vscode, cmd: string) => {
    return vscode.commands.executeCommand(cmd)
  }, command)
}

/** Retorna o frame do webview do Athion, se existir. */
export async function getWebviewFrame() {
  return browser.$('[data-vscode-context*="athion"] iframe, .webview-editor-container iframe')
}

/**
 * Executa uma função dentro do iframe do webview do Athion.
 * Restaura o frame pai automaticamente.
 */
export async function withinWebview<T>(fn: () => Promise<T>): Promise<T> {
  const frame = await getWebviewFrame()
  if (!(await frame.isExisting())) {
    throw new Error('Webview frame not found')
  }
  await browser.switchToFrame(frame)
  try {
    return await fn()
  } finally {
    await browser.switchToParentFrame()
  }
}

/** Abre a command palette do VS Code. */
export async function openCommandPalette(): Promise<void> {
  await browser.keys(['Meta', 'Shift', 'p'])
  await browser.pause(300)
}

/** Fecha qualquer popup/paleta aberta. */
export async function dismissPopups(): Promise<void> {
  await browser.keys('Escape')
  await browser.pause(200)
}
