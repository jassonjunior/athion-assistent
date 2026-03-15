/**
 * useCodeCopy
 * Descrição: Hook para copiar código para a área de transferência com feedback visual temporário.
 */

import { useCallback, useState } from 'react'

/** useCodeCopy
 * Descrição: Hook React que gerencia a cópia de texto para o clipboard com estado de feedback
 * @returns Objeto com `copied` (boolean) e `handleCopy` (função que recebe o texto a copiar)
 */
export function useCodeCopy() {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback((code: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  return { copied, handleCopy }
}
