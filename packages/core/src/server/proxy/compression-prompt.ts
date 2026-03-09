/**
 * Prompts XML para compressao de contexto via LLM.
 * Usados quando o historico excede o limite da context window.
 */

/** System prompt para compressao de contexto.
 * Instrui o LLM a gerar um resumo estruturado das mensagens.
 * @param preserveCount - Quantidade de mensagens recentes preservadas integralmente
 * @returns System prompt formatado
 */
export function compressionSystemPrompt(preserveCount: number): string {
  return `You are a conversation summarizer for an AI coding assistant.
  Your task is to create a concise but complete summary of the conversation history.

  <rules>
  - Preserve ALL technical details: file paths, function names, variable names, error messages
  - Preserve the chronological order of actions taken
  - Preserve any decisions made and their rationale
  - Preserve the current task state and what remains to be done
  - Do NOT include the last ${preserveCount} messages — they are preserved separately
  - Write in the same language the conversation is in
  - Be concise but never lose critical information
  </rules>

  <output_format>
  Return ONLY the summary text. No XML tags, no markdown headers.
  Structure it as:
  1. Context/Goal: What the user is trying to accomplish
  2. Actions Taken: What was done (in order)
  3. Current State: Where things stand now
  4. Key Details: File paths, configs, errors, decisions
  </output_format>`
}

/** User prompt para compressao.
 * Envia as mensagens a comprimir formatadas para o LLM.
 * @param messages - Mensagens a comprimir (ja serializadas como texto)
 * @returns User prompt formatado
 */
export function compressionUserPrompt(messages: string): string {
  return `Summarize the following conversation history. Follow the rules and output format from your instructions.

  <conversation>
  ${messages}
  </conversation>`
}

/** Formata uma mensagem para inclusao no prompt de compressao.
 * @param role - Role da mensagem (system, user, assistant, tool)
 * @param content - Conteudo da mensagem
 * @param toolCalls - Nomes de tool calls (se houver)
 * @returns Mensagem formatada como texto
 */
export function formatMessageForCompression(
  role: string,
  content: string | null,
  toolCalls?: string[],
): string {
  const parts: string[] = [`[${role}]`]

  if (content) {
    const maxLen = 500
    const truncated =
      content.length > maxLen ? content.slice(0, maxLen) + '... (truncated)' : content
    parts.push(truncated)
  }

  if (toolCalls && toolCalls.length > 0) {
    parts.push(`Tool calls: ${toolCalls.join(', ')}`)
  }

  return parts.join(' ')
}

/** Monta o texto completo das mensagens para compressao.
 * @param messages - Array de mensagens no formato {role, content, toolCalls?}
 * @returns Texto formatado com todas as mensagens
 */
export function buildCompressionInput(
  messages: Array<{
    role: string
    content: string | null
    toolCalls?: string[]
  }>,
): string {
  return messages
    .map((m) => formatMessageForCompression(m.role, m.content, m.toolCalls))
    .join('\n\n')
}
