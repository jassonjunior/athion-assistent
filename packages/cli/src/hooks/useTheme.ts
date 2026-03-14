/**
 * Hook useTheme — Carrega o tema ativo da configuração.
 * Descrição: Retorna o tema visual atual baseado na configuração do core.
 */

import { useMemo } from 'react'
import type { AthionCore } from '@athion/core'
import type { Theme } from '../types.js'
import { getTheme } from '../themes/index.js'

/** useTheme
 * Descrição: Hook React que resolve e memoriza o tema visual ativo a partir da configuração do core.
 * @param core - Instância do core do Athion para leitura da configuração de tema
 * @returns O tema visual ativo com as cores definidas
 */
export function useTheme(core: AthionCore): Theme {
  return useMemo(() => {
    const themeName = core.config.get('theme')
    return getTheme(themeName)
  }, [core])
}
