/**
 * CodeBlock
 * Descrição: Bloco de código com label de linguagem e botão de copiar para a área de transferência.
 */

import { useCodeCopy } from '@athion/shared'

/** CodeBlockProps
 * Descrição: Propriedades do componente CodeBlock
 */
interface CodeBlockProps {
  /** Linguagem do bloco de código (ex: "typescript", "python") */
  language: string
  /** Conteúdo do código a ser exibido */
  code: string
}

/** CodeBlock
 * Descrição: Componente que renderiza um bloco de código com destaque de linguagem e funcionalidade de copiar
 * @param language - Linguagem do código para exibição no label
 * @param code - Conteúdo do código a ser renderizado
 * @returns Elemento JSX com o bloco de código estilizado
 */
export function CodeBlock({ language, code }: CodeBlockProps) {
  const { copied, handleCopy } = useCodeCopy()

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-surface-700">
      <div className="flex items-center justify-between bg-surface-850 px-3 py-1.5 text-xs">
        <span className="text-neutral-400">{language}</span>
        <button
          onClick={() => handleCopy(code)}
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
