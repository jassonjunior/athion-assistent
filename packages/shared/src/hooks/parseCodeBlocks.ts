/**
 * parseCodeBlocks
 * Descrição: Utilitário que faz parsing de conteúdo markdown para separar blocos de código de texto.
 */

/** ContentPart
 * Descrição: Representa uma parte do conteúdo parsed — texto ou bloco de código
 */
export interface ContentPart {
  /** Tipo da parte: 'text' para texto regular, 'code' para bloco de código */
  type: 'text' | 'code'
  /** Conteúdo da parte */
  content: string
  /** Linguagem do bloco de código (apenas quando type='code') */
  language?: string
}

/** parseCodeBlocks
 * Descrição: Faz parsing de string markdown, separando texto de blocos de código delimitados por ```
 * @param markdown - Conteúdo markdown a ser parsed
 * @returns Array de ContentPart com texto e código separados
 */
export function parseCodeBlocks(markdown: string): ContentPart[] {
  if (!markdown) return []

  const parts = markdown.split(/(```[\s\S]*?```)/g)
  const result: ContentPart[] = []

  for (const part of parts) {
    if (part.startsWith('```')) {
      const match = part.match(/```(\w*)\n([\s\S]*?)```/)
      if (match) {
        result.push({
          type: 'code',
          content: match[2],
          language: match[1] || 'text',
        })
      }
    } else if (part) {
      result.push({ type: 'text', content: part })
    }
  }

  return result
}
