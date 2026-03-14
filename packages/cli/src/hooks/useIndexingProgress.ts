/**
 * Hook useIndexingProgress — Acompanha o progresso da indexação do codebase.
 * Descrição: Escuta eventos de progresso via Bus e retorna o percentual atual.
 */

import { useState, useEffect } from 'react'
import type { AthionCore } from '@athion/core'
import { indexingProgressEvent } from '@athion/core'

/** IndexingProgress
 * Descrição: Estado do progresso de indexação do codebase
 */
export interface IndexingProgress {
  /** percent - Percentual de progresso (0-100) */
  percent: number
  /** done - Se a indexação já terminou */
  done: boolean
  /** indexing - Se está indexando ativamente (percent > 0 e < 100) */
  indexing: boolean
}

/** useIndexingProgress
 * Descrição: Hook React que escuta o evento indexingProgressEvent via Bus
 * e retorna o estado atual do progresso de indexação.
 * @param core - Instância do core do Athion
 * @returns Estado do progresso de indexação
 */
export function useIndexingProgress(core: AthionCore): IndexingProgress {
  const [progress, setProgress] = useState<IndexingProgress>(() => {
    // Lê estado inicial do core (preenchido durante bootstrap, antes do mount)
    if (core.indexingProgress) {
      const p = core.indexingProgress
      return { percent: p.percent, done: p.done, indexing: !p.done && p.percent < 100 }
    }
    // Se não tem indexer, mostra como done sem indicador
    if (!core.indexer) return { percent: -1, done: true, indexing: false }
    return { percent: 0, done: false, indexing: false }
  })

  useEffect(() => {
    if (!core.indexer) return

    const unsubscribe = core.bus.subscribe(indexingProgressEvent, (data) => {
      setProgress({
        percent: data.percent,
        done: data.done,
        indexing: !data.done && data.percent < 100,
      })
    })

    return unsubscribe
  }, [core])

  return progress
}
