/**
 * Hook useKeyboard — Atalhos de teclado globais.
 *
 * Ctrl+C → sai do processo
 * Ctrl+L → limpa mensagens (callback)
 * Esc     → aborta streaming (callback)
 */

import { useInput } from 'ink'

interface UseKeyboardOptions {
  onClear?: () => void
  onExit?: () => void
  onAbort?: () => void
}

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
