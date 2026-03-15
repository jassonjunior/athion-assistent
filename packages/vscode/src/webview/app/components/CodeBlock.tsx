/**
 * CodeBlock
 * Descrição: Componente de bloco de código com label de linguagem e botão de copiar.
 * Usa CSS do VS Code para estilização (sem dependência de syntax highlighter).
 */

import { useCodeCopy } from '@athion/shared'

/**
 * CodeBlockProps
 * Descrição: Props do componente CodeBlock.
 */
interface CodeBlockProps {
  /** Linguagem de programação para exibição no header */
  language: string
  /** Código fonte a ser exibido no bloco */
  code: string
}

/**
 * CodeBlock
 * Descrição: Renderiza um bloco de código formatado com header de linguagem e funcionalidade de copiar.
 * @param language - Linguagem do código para exibir no label
 * @param code - Conteúdo do código a ser renderizado
 * @returns Elemento JSX do bloco de código
 */
export function CodeBlock({ language, code }: CodeBlockProps) {
  const { copied, handleCopy } = useCodeCopy()

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-lang">{language}</span>
        <button className="copy-button" onClick={() => handleCopy(code)}>
          {copied ? 'Copiado!' : 'Copiar'}
        </button>
      </div>
      <pre className="code-block-content">
        <code>{code}</code>
      </pre>
    </div>
  )
}
