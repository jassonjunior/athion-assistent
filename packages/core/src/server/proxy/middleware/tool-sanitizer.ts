import type { OpenAIChatResponse, OpenAIStreamChunk, OpenAIToolCall } from '../types'

/**
 * Sanitiza argumentos de write_file: converte content objeto para string.
 * @param args - Argumentos parseados
 * @returns Argumentos sanitizados
 */
function sanitizeWriteFile(args: Record<string, unknown>): Record<string, unknown> {
  if (typeof args['content'] === 'object' && args['content'] !== null) {
    return { ...args, content: JSON.stringify(args['content']) }
  }
  return args
}

/**
 * Sanitiza argumentos de exec_command: converte echo com aspas para heredoc.
 * @param args - Argumentos parseados
 * @returns Argumentos sanitizados
 */
function sanitizeExecCommand(args: Record<string, unknown>): Record<string, unknown> {
  const cmd = args['command']
  if (typeof cmd !== 'string') return args
  // Detectar echo 'multi\nline' e converter para heredoc
  const echoMatch = cmd.match(/^echo\s+'([^']*\\n[^']*)'\s*>\s*(.+)$/)
  if (echoMatch) {
    const content = echoMatch[1].replace(/\\n/g, '\n')
    const file = echoMatch[2].trim()
    return { ...args, command: `cat <<'EOF' > ${file}\n${content}\nEOF` }
  }
  return args
}

/**
 * Remove parametros nulos de argumentos Read.
 * @param args - Argumentos parseados
 * @returns Argumentos sem nulos
 */
function sanitizeRead(args: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (v !== null && v !== undefined) {
      cleaned[k] = v
    }
  }
  return cleaned
}

/** Mapa de regras de sanitizacao por nome de funcao */
const SANITIZE_RULES: Record<string, (args: Record<string, unknown>) => Record<string, unknown>> = {
  write_file: sanitizeWriteFile,
  exec_command: sanitizeExecCommand,
  shell: sanitizeExecCommand,
  Read: sanitizeRead,
}

/**
 * Sanitiza uma tool call individual.
 * @param toolCall - Tool call a sanitizar
 * @returns Tool call sanitizada
 */
function sanitizeToolCall(toolCall: OpenAIToolCall): OpenAIToolCall {
  const rule = SANITIZE_RULES[toolCall.function.name]
  if (!rule) return toolCall

  try {
    const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>
    const sanitized = rule(args)
    return {
      ...toolCall,
      function: { ...toolCall.function, arguments: JSON.stringify(sanitized) },
    }
  } catch {
    return toolCall
  }
}

/**
 * Middleware non-streaming: sanitiza tool calls da resposta.
 * @param response - Resposta OpenAI
 * @returns Resposta com tool calls sanitizadas
 */
export function toolSanitizer(response: OpenAIChatResponse): OpenAIChatResponse {
  const choices = response.choices.map((choice) => {
    if (!choice.message.tool_calls) return choice
    return {
      ...choice,
      message: {
        ...choice.message,
        tool_calls: choice.message.tool_calls.map(sanitizeToolCall),
      },
    }
  })
  return { ...response, choices }
}

/**
 * Middleware streaming: sanitiza tool calls de um chunk SSE.
 * @param chunk - Chunk SSE
 * @returns Chunk com tool calls sanitizadas
 */
export function toolSanitizerStream(chunk: OpenAIStreamChunk): OpenAIStreamChunk {
  const delta = chunk.choices?.[0]?.delta
  if (!delta?.tool_calls) return chunk

  const sanitizedCalls = delta.tool_calls.map((tc) => {
    if (!tc.function?.name || !tc.function?.arguments) return tc
    const rule = SANITIZE_RULES[tc.function.name]
    if (!rule) return tc

    try {
      const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
      const sanitized = rule(args)
      return { ...tc, function: { ...tc.function, arguments: JSON.stringify(sanitized) } }
    } catch {
      return tc
    }
  })

  return {
    ...chunk,
    choices: [
      { ...chunk.choices[0], delta: { ...delta, tool_calls: sanitizedCalls } },
      ...chunk.choices.slice(1),
    ],
  }
}
