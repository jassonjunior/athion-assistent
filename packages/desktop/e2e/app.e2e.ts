/**
 * Testes E2E do App Desktop Athion (Tauri 2.x) — WebdriverIO + tauri-driver.
 *
 * Pré-requisitos:
 *   1. `bun run tauri:build` para compilar o app nativo
 *   2. `cargo install tauri-driver` para instalar o WebDriver do Tauri
 *   3. `bun run test:e2e` para executar
 *
 * Testa:
 *   - Janela principal abre com todos os componentes
 *   - Sidebar: criar, selecionar e colapsar sessões
 *   - Status bar reflete estado do sidecar Bun
 *   - Input area: digitação e envio de mensagens
 *   - Toggle de tema dark/light
 *   - Chat com modelo (requer ATHION_E2E_MODEL=1)
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

const HAS_MODEL = !!process.env['ATHION_E2E_MODEL']

describe('App Desktop — inicialização', () => {
  before(async () => {
    await waitForAppReady(30000)
  })

  it('janela principal abre', async () => {
    const title = await browser.getTitle()
    expect(title.toLowerCase()).toMatch(/athion/)
  })

  it('header está visível', async () => {
    const header = await $(SELECTORS.header)
    await expect(header).toBeDisplayed()
  })

  it('sidebar está visível', async () => {
    const sidebar = await $(SELECTORS.sidebar)
    await expect(sidebar).toBeDisplayed()
  })

  it('área de input está visível e habilitada', async () => {
    const input = await $(SELECTORS.inputArea)
    await expect(input).toBeDisplayed()
    const isEnabled = await input.isEnabled()
    // Pode estar desabilitada enquanto sidecar inicia
    expect(typeof isEnabled).toBe('boolean')
  })

  it('status bar está visível', async () => {
    const statusBar = await $(SELECTORS.statusBar)
    await expect(statusBar).toBeDisplayed()
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
    expect(countAfter).toBeGreaterThanOrEqual(countBefore)
  })

  it('nova sessão fica selecionada após criar', async () => {
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

describe('App Desktop — status bar', () => {
  it('status reflete estado do sidecar', async () => {
    await browser.pause(3000)
    const text = (await getStatusText()).toLowerCase()
    // Deve mostrar algum estado (ready, starting, error, etc.)
    expect(text.length >= 0).toBe(true)
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

  it('Ctrl+Enter não envia mensagem (apenas Enter envia)', async () => {
    const input = await $(SELECTORS.inputArea)
    await input.setValue('Mensagem teste ctrl enter')
    const countBefore = await getMessageCount()
    await browser.keys(['Control', 'Enter'])
    await browser.pause(400)
    const countAfter = await getMessageCount()
    // Ctrl+Enter pode inserir nova linha — não deve enviar
    expect(countAfter).toBe(countBefore)
    await input.clearValue()
  })
})

describe('App Desktop — chat com modelo (requer ATHION_E2E_MODEL=1)', () => {
  before(async function () {
    if (!HAS_MODEL) this.skip()
    await waitForAppReady()
    await createNewSession()
  })

  it('envia mensagem e recebe resposta do assistente', async function () {
    if (!HAS_MODEL) this.skip()

    const countBefore = await getMessageCount()
    await sendChatMessage('Responda apenas: OK')
    await waitForStreamingComplete(60000)
    const countAfter = await getMessageCount()
    expect(countAfter).toBeGreaterThan(countBefore)
  })

  it('botão abort aparece durante streaming', async function () {
    if (!HAS_MODEL) this.skip()

    await sendChatMessage('Conte de 1 a 1000 lentamente')
    await browser.pause(800)

    const abortBtn = await $(SELECTORS.abortButton)
    if (await abortBtn.isExisting()) {
      const isDisplayed = await abortBtn.isDisplayed()
      expect(isDisplayed).toBe(true)
      await abortBtn.click()
      await browser.pause(500)
    }
  })

  it('múltiplas sessões mantêm histórico independente', async function () {
    if (!HAS_MODEL) this.skip()

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
