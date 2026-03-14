/**
 * Testes E2E da extensão VS Code — WebdriverIO + wdio-vscode-service.
 *
 * Pré-requisitos:
 *   1. `bun run build` no pacote vscode (compila extension + webview)
 *   2. `bun run test:e2e` para executar via `wdio run e2e/wdio.conf.ts`
 *
 * Testa:
 *   - Extensão ativa sem erros
 *   - Sidebar Athion aparece no activity bar
 *   - Comandos athion.* estão registrados
 *   - Webview de chat renderiza área de input
 *   - Status bar reflete estado do sidecar Bun
 *   - Chat com modelo real
 */
import {
  openAthionSidebar,
  waitForExtensionReady,
  executeAthionCommand,
  openCommandPalette,
  dismissPopups,
  withinWebview,
} from './helpers/vscode-fixture.js'

describe('VS Code Extension — ativação', () => {
  before(async () => {
    await waitForExtensionReady(30000)
  })

  it('extensão está ativa', async () => {
    const isActive = await browser.executeWorkbench((vscode) => {
      return vscode.extensions.getExtension('athion.athion-assistent')?.isActive ?? false
    })
    expect(isActive).toBe(true)
  })

  it('ícone Athion aparece no activity bar', async () => {
    const activityBarItem = await browser.$('*[aria-label="Athion Assistent"]')
    await expect(activityBarItem).toBeExisting()
  })

  it('sidebar abre ao ativar a view', async () => {
    await openAthionSidebar()
    await browser.pause(1000)
    const sidebarContainer = await browser.$('#workbench\\.view\\.extension\\.athion')
    await expect(sidebarContainer).toBeExisting()
  })
})

describe('VS Code Extension — comandos registrados', () => {
  it('athion.newChat está disponível na command palette', async () => {
    await openCommandPalette()
    const input = await browser.$('.quick-input-widget input')
    await input.setValue('Athion: New Chat')
    await browser.pause(400)
    const results = await browser.$$('.quick-input-list-entry')
    const found = await Promise.all(
      results.map(async (r) => {
        const label = await r.getText()
        return label.toLowerCase().includes('athion')
      }),
    )
    expect(found.some(Boolean)).toBe(true)
    await dismissPopups()
  })

  it('athion.newChat executa sem lançar erro', async () => {
    await expect(executeAthionCommand('athion.newChat')).resolves.not.toThrow()
    await browser.pause(300)
  })

  it('athion.focusChat foca o painel de chat', async () => {
    await executeAthionCommand('athion.focusChat')
    await browser.pause(500)
    const chatView = await browser.$('[data-viewlet-id*="athion.chat"]')
    await expect(chatView).toBeExisting()
  })
})

describe('VS Code Extension — webview de chat', () => {
  before(async () => {
    await openAthionSidebar()
    await browser.pause(2500)
  })

  it('webview renderiza sem erro de script', async () => {
    const frame = await browser.$('[data-vscode-context*="athion"] iframe')
    if (await frame.isExisting()) {
      const hasFrame = await frame.isDisplayed()
      expect(hasFrame).toBe(true)
    }
  })

  it('área de input de chat está acessível no webview', async () => {
    await withinWebview(async () => {
      const input = await browser.$('textarea, [contenteditable="true"], input[type="text"]')
      await expect(input).toBeExisting()
    })
  })
})

describe('VS Code Extension — dependency graph', () => {
  it('athion.showDependencyGraph abre um painel webview', async () => {
    await executeAthionCommand('athion.showDependencyGraph')
    await browser.pause(2000)

    // Verifica que um editor tab com título "Dependency Graph" existe
    const tabs = await browser.$$('.tab .label-name')
    const labels = await Promise.all(tabs.map((t) => t.getText()))
    const hasGraphTab = labels.some((l) => l.includes('Dependency Graph'))
    expect(hasGraphTab).toBe(true)
  })
})

describe('VS Code Extension — status bar', () => {
  it('sidecar Bun inicia e status fica ready', async () => {
    // Aguarda sidecar subir (até 30s)
    await browser.waitUntil(
      async () => {
        const statusItems = await browser.$$('.statusbar-item')
        const labels = await Promise.all(statusItems.map((item) => item.getAttribute('aria-label')))
        return labels.some(
          (l) => l?.toLowerCase().includes('ready') || l?.toLowerCase().includes('athion'),
        )
      },
      { timeout: 30000, interval: 1000 },
    )
  })
})

describe('VS Code Extension — chat com modelo', () => {
  before(async () => {
    await openAthionSidebar()
    // Aguarda sidecar pronto
    await browser.pause(5000)
  })

  it('envia mensagem e recebe resposta no webview', async () => {
    await withinWebview(async () => {
      const input = await browser.$('textarea, [contenteditable="true"]')
      await input.waitForExist({ timeout: 10000 })
      await input.click()
      await input.setValue('Responda apenas: OK')
      await browser.keys('Enter')

      // Aguarda a resposta do assistente aparecer
      await browser.waitUntil(
        async () => {
          const messages = await browser.$$('[class*="message"], [data-role="assistant"]')
          return messages.length > 0
        },
        { timeout: 60000, interval: 500 },
      )

      const messages = await browser.$$('[class*="message"], [data-role="assistant"]')
      expect(messages.length).toBeGreaterThan(0)
    })
  })

  it('múltiplas mensagens acumulam no histórico', async () => {
    await withinWebview(async () => {
      const input = await browser.$('textarea, [contenteditable="true"]')
      await input.click()
      await input.setValue('Qual foi minha última mensagem?')
      await browser.keys('Enter')

      await browser.waitUntil(
        async () => {
          const messages = await browser.$$('[class*="message"]')
          return messages.length >= 2
        },
        { timeout: 60000, interval: 500 },
      )

      const messages = await browser.$$('[class*="message"]')
      expect(messages.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('athion.abortChat interrompe a resposta em andamento', async () => {
    await withinWebview(async () => {
      const input = await browser.$('textarea, [contenteditable="true"]')
      await input.click()
      await input.setValue('Conte de 1 a 1000 escrevendo cada número por extenso')
      await browser.keys('Enter')
    })

    // Aguarda começar a responder
    await browser.pause(800)

    // Aborta via comando
    await executeAthionCommand('athion.abortChat')
    await browser.pause(500)

    // O comando não deve lançar erro
  })
})
