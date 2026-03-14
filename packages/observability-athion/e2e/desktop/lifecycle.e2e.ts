/**
 * Desktop E2E: App Lifecycle
 *
 * Verifies sidecar shutdown, tray functionality, and clean exit.
 */

import { describe, it } from 'bun:test'

describe('Sidecar Lifecycle', () => {
  it.todo('should kill sidecar when window is closed')
  it.todo('should not leave orphan processes')
  it.todo('should auto-restart sidecar after crash')
  it.todo('should stop restarting after 3 crashes in 60s')
})

describe('System Tray', () => {
  it.todo('should show tray icon with menu')
  it.todo('should open window from tray "Abrir Flow Observer"')
  it.todo('should quit app from tray "Sair"')
})
