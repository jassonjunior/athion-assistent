/**
 * Hook useKeyboard — Atalhos de teclado globais.
 *
 * Ctrl+C → sai do processo
 * Ctrl+L → limpa mensagens (callback)
 */

import { useInput } from 'ink'

interface UseKeyboardOptions {
  onClear?: () => void
  onExit?: () => void
}

export function useKeyboard(options: UseKeyboardOptions = {}) {
  useInput((_input, key) => {
    if (key.ctrl && _input === 'l') {
      options.onClear?.()
    }
  })
}
