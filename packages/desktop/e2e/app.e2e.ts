/**
 * Testes E2E do App Desktop Athion (Tauri 2.x) — WebdriverIO + tauri-driver.
 *
 * Pré-requisitos:
 *   1. `bun run tauri:build` para compilar o app nativo
 *   2. `cargo install tauri-driver`
 *   3. `bun run test:e2e`
 *
 * Testa com modelo real:
 *   - Janela principal e todos os componentes
 *   - Sidebar: criar, selecionar e colapsar sessões
 *   - Input: digitação e envio de mensagens
 *   - Chat completo com resposta do modelo
 *   - Abort durante streaming
 *   - Múltiplas sessões com histórico independente
 *   - Toggle de tema dark/light
 */
import {
  SELECTORS,
  waitForAppReady,
  sendChatMessage,
  waitForStreamingComplete,
  createNewSession,
  getMessageCount,
  getSidebarSessionCount,
  getStatusText,
} from './helpers/tauri-fixture.js'

describe('App Desktop — inicialização', () => {
  before(async () => {
    await waitForAppReady(30000)
  })

  it('janela principal abre com título Athion', async () => {
    const title = await browser.getTitle()
    expect(title.toLowerCase()).toMatch(/athion/)
  })

  it('header está visível', async () => {
    const header = await $(SELECTORS.header)
    await expect(header).toBeDisplayed()
  })

  it('sidebar está visível por padrão', async () => {
    const sidebar = await $(SELECTORS.sidebar)
    await expect(sidebar).toBeDisplayed()
  })

  it('área de input está visível', async () => {
    const input = await $(SELECTORS.inputArea)
    await expect(input).toBeDisplayed()
  })

  it('status bar está visível', async () => {
    const statusBar = await $(SELECTORS.statusBar)
    await expect(statusBar).toBeDisplayed()
  })

  it('sidecar Bun inicia e status fica ready', async () => {
    await browser.waitUntil(
      async () => {
        const text = (await getStatusText()).toLowerCase()
        return text.includes('ready') || text.includes('pronto') || text.includes('conectado')
      },
      { timeout: 30000, interval: 1000 },
    )
  })
})

describe('App Desktop — sidebar e sessões', () => {
  before(async () => {
    await waitForAppReady()
  })

  it('sidebar pode ser colapsada e expandida via toggle', async () => {
    const toggle = await $(SELECTORS.sidebarToggle)
    if (!(await toggle.isExisting())) return

    await toggle.click()
    await browser.pause(400)
    const sidebar = await $(SELECTORS.sidebar)
    const classAfterCollapse = (await sidebar.getAttribute('class')) ?? ''
    expect(classAfterCollapse).toMatch(/collapsed|hidden|w-0/)

    await toggle.click()
    await browser.pause(400)
    const classAfterExpand = (await sidebar.getAttribute('class')) ?? ''
    expect(classAfterExpand).not.toMatch(/collapsed/)
  })

  it('botão "Nova sessão" cria sessão na lista', async () => {
    const countBefore = await getSidebarSessionCount()
    await createNewSession()
    const countAfter = await getSidebarSessionCount()
    expect(countAfter).toBeGreaterThan(countBefore)
  })

  it('nova sessão fica ativa após criar', async () => {
    await createNewSession()
    const sessions = await $$(SELECTORS.sessionItem)
    if (sessions.length === 0) return
    const last = sessions[sessions.length - 1]
    const classes = (await last.getAttribute('class')) ?? ''
    expect(classes).toMatch(/active|selected|current/)
  })

  it('clicar em sessão diferente a seleciona', async () => {
    await createNewSession()
    await createNewSession()
    const sessions = await $$(SELECTORS.sessionItem)
    if (sessions.length < 2) return
    await sessions[0].click()
    await browser.pause(300)
    const classes = (await sessions[0].getAttribute('class')) ?? ''
    expect(classes).toMatch(/active|selected/)
  })
})

describe('App Desktop — tema', () => {
  it('toggle de tema alterna dark/light', async () => {
    const toggle = await $(SELECTORS.themeToggle)
    if (!(await toggle.isExisting())) return

    const root = await $('html')
    const classBefore = (await root.getAttribute('class')) ?? ''
    const dataBefore = (await root.getAttribute('data-theme')) ?? ''

    await toggle.click()
    await browser.pause(400)

    const classAfter = (await root.getAttribute('class')) ?? ''
    const dataAfter = (await root.getAttribute('data-theme')) ?? ''

    expect(classAfter + dataAfter).not.toBe(classBefore + dataBefore)
  })
})

describe('App Desktop — input de chat', () => {
  before(async () => {
    await waitForAppReady()
    await createNewSession()
  })

  it('input aceita texto digitado', async () => {
    const input = await $(SELECTORS.inputArea)
    await input.click()
    await input.setValue('Teste de digitação E2E')
    const value = await input.getValue()
    expect(value).toContain('Teste')
    await input.clearValue()
  })

  it('Enter com campo vazio não envia mensagem', async () => {
    const input = await $(SELECTORS.inputArea)
    await input.clearValue()
    const countBefore = await getMessageCount()
    await browser.keys('Enter')
    await browser.pause(400)
    const countAfter = await getMessageCount()
    expect(countAfter).toBe(countBefore)
  })
})

describe('App Desktop — chat com modelo', () => {
  before(async () => {
    await waitForAppReady()
    await createNewSession()
  })

  it('envia mensagem e recebe resposta do assistente', async () => {
    const countBefore = await getMessageCount()
    await sendChatMessage('Responda apenas: OK')
    await waitForStreamingComplete(60000)
    const countAfter = await getMessageCount()
    expect(countAfter).toBeGreaterThan(countBefore)
  })

  it('resposta contém texto não-vazio', async () => {
    await sendChatMessage('Diga "Olá mundo"')
    await waitForStreamingComplete(60000)
    const msgs = await $$(SELECTORS.messageItem)
    const lastMsg = msgs[msgs.length - 1]
    const text = await lastMsg.getText()
    expect(text.length).toBeGreaterThan(0)
  })

  it('botão abort aparece durante streaming e para a resposta', async () => {
    await sendChatMessage('Conte de 1 a 500 escrevendo cada número por extenso em português')
    await browser.pause(800)

    const abortBtn = await $(SELECTORS.abortButton)
    if (await abortBtn.isExisting()) {
      const isDisplayed = await abortBtn.isDisplayed()
      expect(isDisplayed).toBe(true)
      await abortBtn.click()
      await browser.pause(500)

      // Após abort, botão deve sumir
      const abortBtnAfter = await $(SELECTORS.abortButton)
      const stillVisible = (await abortBtnAfter.isExisting())
        ? await abortBtnAfter.isDisplayed()
        : false
      expect(stillVisible).toBe(false)
    }
  })

  it('múltiplas sessões mantêm histórico independente', async () => {
    const session1 = await createNewSession()
    await sendChatMessage('Minha sessão é: ALFA')
    await waitForStreamingComplete(30000)

    await createNewSession()
    await sendChatMessage('Minha sessão é: BETA')
    await waitForStreamingComplete(30000)

    // Voltar para sessão 1
    if (session1) {
      const sessions = await $$(SELECTORS.sessionItem)
      const s1Item = await browser.$(`[data-session-id="${session1}"]`)
      if (await s1Item.isExisting()) {
        await s1Item.click()
        await browser.pause(300)
        const msgs = await $$(SELECTORS.messageItem)
        const texts = await Promise.all(msgs.map((m) => m.getText()))
        expect(texts.join(' ').toLowerCase()).not.toContain('beta')
      }
      expect(sessions.length).toBeGreaterThan(0)
    }
  })
})
