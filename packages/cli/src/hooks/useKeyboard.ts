/**
 * Hook useKeyboard — Atalhos de teclado globais.
 * Descrição: Registra atalhos de teclado globais para a TUI do chat.
 *
 * Ctrl+C → sai do processo
 * Ctrl+L → limpa mensagens (callback)
 * Esc     → aborta streaming (callback)
 */

import { useInput } from 'ink'

/** UseKeyboardOptions
 * Descrição: Opções de callbacks para os atalhos de teclado globais.
 */
interface UseKeyboardOptions {
  /** Callback executado ao pressionar Ctrl+L para limpar mensagens */
  onClear?: () => void
  /** Callback executado ao sair do processo */
  onExit?: () => void
  /** Callback executado ao pressionar Esc para abortar streaming */
  onAbort?: () => void
}

/** useKeyboard
 * Descrição: Hook React que registra listeners de atalhos de teclado globais na TUI.
 * @param options - Callbacks opcionais para os eventos de teclado (clear, exit, abort)
 */
export function useKeyboard(options: UseKeyboardOptions = {}) {
  useInput((_input, key) => {
    if (key.ctrl && _input === 'l') {
      options.onClear?.()
    }
    if (key.escape) {
      options.onAbort?.()
    }
  })
}
