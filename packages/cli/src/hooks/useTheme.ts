/**
 * Hook useTheme — Carrega o tema ativo da config.
 */

import { useMemo } from 'react'
import type { AthionCore } from '@athion/core'
import type { Theme } from '../types.js'
import { getTheme } from '../themes/index.js'

export function useTheme(core: AthionCore): Theme {
  return useMemo(() => {
    const themeName = core.config.get('theme')
    return getTheme(themeName)
  }, [core])
}
