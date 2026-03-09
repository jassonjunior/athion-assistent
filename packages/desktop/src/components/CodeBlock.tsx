/**
 * CodeBlock — Bloco de código com label de linguagem e botão copiar.
 */

import { useCallback, useState } from 'react'

interface CodeBlockProps {
  language: string
  code: string
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [code])

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-surface-700">
      <div className="flex items-center justify-between bg-surface-850 px-3 py-1.5 text-xs">
        <span className="text-neutral-400">{language}</span>
        <button
          onClick={handleCopy}
          className="text-neutral-500 transition-colors hover:text-neutral-300"
        >
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
      <pre className="overflow-x-auto bg-surface-900 p-3">
        <code className="text-[13px] leading-relaxed text-neutral-200">{code}</code>
      </pre>
    </div>
  )
}
