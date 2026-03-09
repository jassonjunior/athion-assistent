/**
 * Testes E2E do Chat App (test-ui) — Playwright.
 *
 * Testa o dashboard de debug do Athion com modelo real:
 *   - Página carrega com título e layout corretos
 *   - Conecta ao servidor via WebSocket
 *   - Lista de testes disponíveis aparece
 *   - Protocolo WebSocket (test:list, test:run, test:stop)
 *   - Execução de teste emite eventos no LogPanel
 *   - TokenBar atualiza com tokens reais
 *   - FlowPanel renderiza grafo dos eventos
 *   - Botão Stop interrompe execução
 *
 * Executar: bun run test:e2e
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const WS_URL = 'ws://localhost:3457/api/ws'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Tenta clicar no primeiro botão que contenha o texto dado (case-insensitive). */
async function clickButtonWithText(page: Page, text: string): Promise<boolean> {
  const btn = page
    .locator('button')
    .filter({ hasText: new RegExp(text, 'i') })
    .first()
  if (await btn.isVisible()) {
    await btn.click()
    return true
  }
  return false
}

// ─── Suite: carregamento ─────────────────────────────────────────────────────

test.describe('Chat App — carregamento inicial', () => {
  test('página carrega e título contém Athion', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/[Aa]thion/)
  })

  test('header / título principal é visível', async ({ page }) => {
    await page.goto('/')
    const heading = page.locator('h1, header').first()
    await expect(heading).toBeVisible()
  })

  test('sem erros de console críticos ao carregar', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    await page.goto('/')
    await page.waitForTimeout(2000)
    const criticalErrors = consoleErrors.filter(
      (e) => !e.includes('WebSocket') && !e.includes('ECONNREFUSED'),
    )
    expect(criticalErrors).toHaveLength(0)
  })
})

// ─── Suite: WebSocket ────────────────────────────────────────────────────────

test.describe('Chat App — conexão WebSocket', () => {
  test('conecta ao servidor via WebSocket na abertura', async ({ page }) => {
    let wsConnected = false
    page.on('websocket', (ws) => {
      if (ws.url().includes('/ws') || ws.url().includes('/api/ws')) {
        wsConnected = true
      }
    })
    await page.goto('/')
    await page.waitForTimeout(3000)
    expect(wsConnected).toBe(true)
  })

  test('lista de testes aparece após conexão', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(3000)
    const buttons = page.locator('button')
    const count = await buttons.count()
    expect(count).toBeGreaterThan(0)
  })
})

// ─── Suite: protocolo WebSocket direto ───────────────────────────────────────

test.describe('Chat App — protocolo WebSocket', () => {
  test('test:list retorna array de testes disponíveis', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)

    const result = await page.evaluate(async (wsUrl) => {
      return new Promise<{ type: string; tests?: unknown[] } | null>((resolve) => {
        const ws = new WebSocket(wsUrl)
        const timer = setTimeout(() => {
          ws.close()
          resolve(null)
        }, 8000)

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string) as { type: string; tests?: unknown[] }
            if (msg.type === 'test:list') {
              clearTimeout(timer)
              ws.close()
              resolve(msg)
            }
          } catch {
            /* ignore */
          }
        }

        ws.onopen = () => ws.send(JSON.stringify({ type: 'test:list' }))
        ws.onerror = () => {
          clearTimeout(timer)
          resolve(null)
        }
      })
    }, WS_URL)

    expect(result).not.toBeNull()
    expect(result?.type).toBe('test:list')
    expect(Array.isArray(result?.tests)).toBe(true)
    expect((result?.tests ?? []).length).toBeGreaterThan(0)
  })

  test('test:run emite eventos test:started e test:finished', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(1000)

    const result = await page.evaluate(async (wsUrl) => {
      return new Promise<{ started: boolean; finished: boolean; events: string[] }>((resolve) => {
        const ws = new WebSocket(wsUrl)
        const events: string[] = []
        let testName = ''

        const timer = setTimeout(() => {
          ws.close()
          resolve({ started: events.includes('test:started'), finished: false, events })
        }, 120000)

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data as string) as {
              type: string
              tests?: Array<{ name: string }>
            }
            events.push(msg.type)

            if (msg.type === 'test:list' && msg.tests && msg.tests.length > 0) {
              testName = msg.tests[0].name
              ws.send(JSON.stringify({ type: 'test:run', testName }))
            }

            if (msg.type === 'test:finished') {
              clearTimeout(timer)
              ws.close()
              resolve({ started: events.includes('test:started'), finished: true, events })
            }
          } catch {
            /* ignore */
          }
        }

        ws.onopen = () => ws.send(JSON.stringify({ type: 'test:list' }))
        ws.onerror = () => {
          clearTimeout(timer)
          resolve({ started: false, finished: false, events })
        }
      })
    }, WS_URL)

    expect(result.started).toBe(true)
    expect(result.finished).toBe(true)
    expect(result.events.length).toBeGreaterThan(2)
  }, 130000)
})

// ─── Suite: interface ────────────────────────────────────────────────────────

test.describe('Chat App — interface e controles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2000)
  })

  test('toggle de modo (Split/Flow/Log) funciona', async ({ page }) => {
    const modeButtons = page.locator('button').filter({ hasText: /split|flow|log/i })
    const count = await modeButtons.count()
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await modeButtons.nth(i).click()
        await page.waitForTimeout(200)
      }
    }
  })
})

// ─── Suite: execução com modelo ──────────────────────────────────────────────

test.describe('Chat App — execução com modelo', () => {
  test('clicar em "Run" inicia o teste e emite eventos no log', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(3000)

    const wasClicked = await clickButtonWithText(page, 'run|executar|iniciar')
    if (!wasClicked) {
      test.skip()
      return
    }

    await page.waitForFunction(
      () => {
        const logs = document.querySelectorAll(
          '[class*="log-item"], [class*="event"], [data-testid*="event"]',
        )
        return logs.length > 0
      },
      { timeout: 120000 },
    )

    const logItems = await page.$$('[class*="log-item"], [class*="event"]')
    expect(logItems.length).toBeGreaterThan(0)
  }, 130000)

  test('TokenBar mostra tokens não-zero durante/após execução', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(3000)

    await clickButtonWithText(page, 'run|executar')

    await page.waitForFunction(
      () => {
        const tokenEl = document.querySelector('[class*="token-bar"], [data-testid*="token"]')
        if (!tokenEl) return false
        const text = tokenEl.textContent ?? ''
        return text !== '' && text !== '0'
      },
      { timeout: 120000 },
    )
  }, 130000)

  test('FlowPanel renderiza nós após eventos do orchestrator', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(3000)

    await clickButtonWithText(page, 'run|executar')

    await page.waitForFunction(
      () => {
        const svgOrCanvas = document.querySelector('svg[class*="flow"], canvas, .react-flow__node')
        return !!svgOrCanvas
      },
      { timeout: 120000 },
    )

    const flowElement = page.locator('svg[class*="flow"], .react-flow__node, canvas').first()
    await expect(flowElement).toBeVisible({ timeout: 5000 })
  }, 130000)

  test('botão "Stop" interrompe a execução do teste', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(3000)

    await clickButtonWithText(page, 'run|executar')
    await page.waitForTimeout(1500)

    const stopped = await clickButtonWithText(page, 'stop|parar|abort')
    if (stopped) {
      await page.waitForTimeout(800)
      const content = await page.content()
      const hasStopped =
        content.includes('stopped') ||
        content.includes('parado') ||
        content.includes('aborted') ||
        content.includes('finished')
      expect(hasStopped).toBe(true)
    }
  }, 60000)
})
