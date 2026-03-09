/**
 * Tauri E2E Fixtures — helpers para testes com WebdriverIO + tauri-driver.
 *
 * Expõe utilitários para interagir com os componentes do app desktop:
 *   - aguardar o app ficar pronto
 *   - enviar mensagens no chat
 *   - criar sessões
 *   - checar status bar
 */

/** Seletores CSS dos componentes principais do Desktop App */
export const SELECTORS = {
  // Layout
  header: 'header',
  sidebar: '[data-testid="sidebar"]',
  sidebarToggle: '[data-testid="sidebar-toggle"]',
  mainContent: '[data-testid="main-content"], .flex-1',

  // Sessões
  newSessionBtn: '[data-testid="new-session-btn"], button[aria-label*="Nova sessão"]',
  sessionItem: '[data-testid="session-item"]',
  sessionActiveItem: '[data-testid="session-item"].active',

  // Chat
  messageList: '[data-testid="message-list"]',
  messageItem: '[data-testid="message-item"]',
  inputArea: 'textarea[data-testid="chat-input"], textarea[placeholder*="mensagem"]',
  sendButton: '[data-testid="send-btn"], button[type="submit"]',
  abortButton:
    '[data-testid="abort-btn"], button[aria-label*="Abort"], button[aria-label*="Parar"]',

  // Status e Tema
  statusBar: '[data-testid="status-bar"]',
  statusText: '[data-testid="status-text"]',
  themeToggle:
    '[data-testid="theme-toggle"], button[aria-label*="tema"], button[aria-label*="mode"]',
} as const

/** Aguarda o app estar pronto (sidecar Bun respondendo). */
export async function waitForAppReady(timeoutMs = 30000): Promise<void> {
  await browser.waitUntil(
    async () => {
      try {
        const statusText = await $(SELECTORS.statusText)
        if (!(await statusText.isExisting())) return true
        const text = (await statusText.getText()).toLowerCase()
        return text.includes('ready') || text.includes('pronto') || text.includes('conectado')
      } catch {
        return false
      }
    },
    { timeout: timeoutMs, interval: 500, timeoutMsg: 'App not ready' },
  )
}

/** Envia uma mensagem no chat via textarea + Enter. */
export async function sendChatMessage(text: string): Promise<void> {
  const input = await $(SELECTORS.inputArea)
  await input.waitForExist({ timeout: 5000 })
  await input.clearValue()
  await input.setValue(text)
  await browser.keys('Enter')
}

/** Aguarda o streaming terminar (botão abort some). */
export async function waitForStreamingComplete(timeoutMs = 60000): Promise<void> {
  await browser.waitUntil(
    async () => {
      const abortBtn = await $(SELECTORS.abortButton)
      return !(await abortBtn.isExisting())
    },
    { timeout: timeoutMs, interval: 300 },
  )
}

/** Cria uma nova sessão via sidebar e retorna o sessionId (se disponível). */
export async function createNewSession(): Promise<string> {
  const btn = await $(SELECTORS.newSessionBtn)
  await btn.waitForExist({ timeout: 5000 })
  await btn.click()
  await browser.pause(600)
  const sessions = await $$(SELECTORS.sessionItem)
  if (sessions.length > 0) {
    const last = sessions[sessions.length - 1]
    return (await last.getAttribute('data-session-id')) ?? ''
  }
  return ''
}

/** Conta as mensagens visíveis no chat. */
export async function getMessageCount(): Promise<number> {
  const list = await $(SELECTORS.messageList)
  if (!(await list.isExisting())) return 0
  const msgs = await list.$$(SELECTORS.messageItem)
  return msgs.length
}

/** Retorna o número de sessões na sidebar. */
export async function getSidebarSessionCount(): Promise<number> {
  const sessions = await $$(SELECTORS.sessionItem)
  return sessions.length
}

/** Retorna o texto do status bar. */
export async function getStatusText(): Promise<string> {
  const el = await $(SELECTORS.statusText)
  if (!(await el.isExisting())) return ''
  return el.getText()
}
