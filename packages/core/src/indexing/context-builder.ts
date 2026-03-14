/** ContextBuilder
 * Descrição: Monta contexto hierárquico L0→L4→Impact→L2→L3→Task para o agente.
 * Usa Composite Pattern com blocos priorizados e budget de tokens.
 * Blocos required são sempre incluídos; os demais preenchem o budget restante.
 */

/** ContextBlock
 * Descrição: Bloco de contexto com prioridade e controle de inclusão
 */
export interface ContextBlock {
  /** name - Identificador do bloco (ex: 'L0_repo_meta') */
  name: string
  /** priority - Prioridade (1 = mais alto, sempre incluído primeiro) */
  priority: number
  /** estimatedTokens - Tokens estimados do bloco */
  estimatedTokens: number
  /** content - Conteúdo textual do bloco */
  content: string
  /** required - Se true, sempre incluído independente do budget */
  required: boolean
}

/** AssembledContext
 * Descrição: Resultado da montagem do contexto com metadados
 */
export interface AssembledContext {
  /** text - Texto final montado */
  text: string
  /** totalTokens - Total de tokens estimados */
  totalTokens: number
  /** includedBlocks - Nomes dos blocos incluídos */
  includedBlocks: string[]
  /** excludedBlocks - Nomes dos blocos excluídos por falta de budget */
  excludedBlocks: string[]
}

/** DEFAULT_TOKEN_BUDGET
 * Descrição: Budget padrão de tokens (8000)
 */
const DEFAULT_TOKEN_BUDGET = 8000

/** CHARS_PER_TOKEN
 * Descrição: Estimativa de caracteres por token (~3.5)
 */
const CHARS_PER_TOKEN = 3.5

/** estimateTokens
 * Descrição: Estima tokens de um texto (~3.5 chars/token)
 * @param text - Texto a estimar
 * @returns Número estimado de tokens
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/** truncateBlock
 * Descrição: Trunca conteúdo preservando linhas completas
 * @param content - Conteúdo a truncar
 * @param maxTokens - Máximo de tokens permitido
 * @returns Conteúdo truncado
 */
export function truncateBlock(content: string, maxTokens: number): string {
  const maxChars = Math.floor(maxTokens * CHARS_PER_TOKEN)
  if (content.length <= maxChars) return content

  const lines = content.split('\n')
  let charCount = 0
  const kept: string[] = []

  for (const line of lines) {
    if (charCount + line.length + 1 > maxChars) break
    kept.push(line)
    charCount += line.length + 1
  }

  if (kept.length === 0 && lines.length > 0) {
    const firstLine = lines[0]
    if (firstLine) kept.push(firstLine.slice(0, maxChars))
  }

  return kept.join('\n') + '\n...[truncated]'
}

/** ContextAssembler
 * Descrição: Monta contexto hierárquico respeitando budget de tokens.
 * Blocos required são sempre incluídos. Os demais são ordenados por
 * prioridade e incluídos até esgotar o budget.
 */
export class ContextAssembler {
  private blocks: ContextBlock[] = []
  private tokenBudget: number

  /** constructor
   * Descrição: Cria assembler com budget de tokens configurável
   * @param tokenBudget - Budget máximo de tokens (default: 8000)
   */
  constructor(tokenBudget: number = DEFAULT_TOKEN_BUDGET) {
    this.tokenBudget = tokenBudget
  }

  /** addBlock
   * Descrição: Adiciona um bloco de contexto ao assembler
   * @param block - Bloco a adicionar
   * @returns this (fluent API)
   */
  addBlock(block: ContextBlock): this {
    this.blocks.push(block)
    return this
  }

  /** assemble
   * Descrição: Monta o contexto final respeitando budget e prioridades.
   * 1) Inclui todos os blocos required (truncados se necessário)
   * 2) Ordena os opcionais por prioridade
   * 3) Inclui opcionais até esgotar o budget
   * @returns Contexto montado com metadados
   */
  assemble(): AssembledContext {
    const included: ContextBlock[] = []
    const excluded: string[] = []
    let usedTokens = 0

    // Ordena por prioridade (menor = mais importante)
    const sorted = [...this.blocks].sort((a, b) => a.priority - b.priority)

    // Primeiro: inclui required blocks
    for (const block of sorted) {
      if (!block.required) continue
      const tokens = block.estimatedTokens
      if (usedTokens + tokens > this.tokenBudget) {
        // Required mas excede budget — trunca
        const remainingBudget = Math.max(0, this.tokenBudget - usedTokens)
        if (remainingBudget > 0) {
          included.push({
            ...block,
            content: truncateBlock(block.content, remainingBudget),
            estimatedTokens: remainingBudget,
          })
          usedTokens += remainingBudget
        }
      } else {
        included.push(block)
        usedTokens += tokens
      }
    }

    // Segundo: inclui optional blocks por prioridade
    for (const block of sorted) {
      if (block.required) continue
      if (usedTokens + block.estimatedTokens <= this.tokenBudget) {
        included.push(block)
        usedTokens += block.estimatedTokens
      } else {
        // Tenta truncar para caber
        const remainingBudget = this.tokenBudget - usedTokens
        if (remainingBudget >= 50) {
          included.push({
            ...block,
            content: truncateBlock(block.content, remainingBudget),
            estimatedTokens: remainingBudget,
          })
          usedTokens += remainingBudget
        } else {
          excluded.push(block.name)
        }
      }
    }

    // Monta texto na ordem de prioridade
    const text = included.map((b) => b.content).join('\n\n')

    return {
      text,
      totalTokens: usedTokens,
      includedBlocks: included.map((b) => b.name),
      excludedBlocks: excluded,
    }
  }

  /** getTokenBudget
   * Descrição: Retorna o budget de tokens configurado
   */
  getTokenBudget(): number {
    return this.tokenBudget
  }
}
