/**
 * useTheme
 * Descrição: Hook para alternância de tema dark/light mode.
 * Persiste a preferência no localStorage e usa o prefers-color-scheme do sistema como padrão.
 */

import { useCallback, useEffect, useState } from 'react'

/** Theme
 * Descrição: Tipo que representa os modos de tema disponíveis
 */
type Theme = 'dark' | 'light'

/** getInitialTheme
 * Descrição: Obtém o tema inicial a partir do localStorage ou da preferência do sistema operacional
 * @returns O tema inicial ('dark' ou 'light')
 */
function getInitialTheme(): Theme {
  const stored = localStorage.getItem('athion-theme') as Theme | null
  if (stored) return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** useTheme
 * Descrição: Hook React que gerencia o tema da aplicação, alternando entre dark e light mode
 * @returns Objeto com o tema atual e função toggle para alternar
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('athion-theme', theme)
  }, [theme])

  /** toggle
   * Descrição: Alterna entre os modos dark e light
   */
  const toggle = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  }, [])

  return { theme, toggle }
}
