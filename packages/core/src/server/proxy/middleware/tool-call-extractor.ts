import type { OpenAIStreamChunk } from '../types'

const TAG_START = '<tool_call>'
const TAG_END = '</tool_call>'

// Qwen3/vllm format: [Calling tool: name({"arg":"val"})]
const BRACKET_START = '[Calling tool: '
const BRACKET_END = ')]'

/** Tool call parseada */
interface ParsedToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

/** Estado do extractor para streaming */
export interface ToolCallExtractorState {
  insideToolCall: boolean
  insideBracketCall: boolean
  buffer: string
  pending: string
  extractedCalls: ParsedToolCall[]
  hasToolCalls: boolean
}

/**
 * Cria estado inicial do tool call extractor.
 * @returns ToolCallExtractorState
 */
export function createToolCallExtractorState(): ToolCallExtractorState {
  return {
    insideToolCall: false,
    insideBracketCall: false,
    buffer: '',
    pending: '',
    extractedCalls: [],
    hasToolCalls: false,
  }
}

/**
 * Processa conteudo texto, extraindo tool calls.
 * Suporta dois formatos:
 * - XML: <tool_call>...</tool_call>
 * - Bracket (Qwen3/vllm): [Calling tool: name({"arg":"val"})]
 * @param content - Texto do chunk
 * @param state - Estado mutavel do extractor
 * @returns Texto a emitir ou null (suprimido)
 */
export function processContent(content: string, state: ToolCallExtractorState): string | null {
  if (state.insideToolCall) {
    return handleInsideToolCall(content, state)
  }

  if (state.insideBracketCall) {
    return handleInsideBracketCall(content, state)
  }

  const text = state.pending + content
  state.pending = ''

  if (text.includes(TAG_START)) {
    return handleTagStart(text, state)
  }

  if (text.includes(BRACKET_START)) {
    return handleBracketStart(text, state)
  }

  return handlePartialTag(text, state)
}

/**
 * Processa conteudo quando estamos dentro de um tool call.
 * @param content - Texto do chunk
 * @param state - Estado mutavel
 * @returns Texto ou null
 */
function handleInsideToolCall(content: string, state: ToolCallExtractorState): string | null {
  state.buffer += content

  if (!state.buffer.includes(TAG_END)) return null

  const endIdx = state.buffer.indexOf(TAG_END)
  const tcText = state.buffer.slice(0, endIdx)
  const after = state.buffer.slice(endIdx + TAG_END.length)
  state.insideToolCall = false
  state.buffer = ''

  const parsed = parseToolCall(tcText)
  if (parsed) state.extractedCalls.push(parsed)

  if (after.trim()) return processContent(after, state)
  return null
}

/**
 * Processa quando encontramos TAG_START no texto.
 * @param text - Texto completo (pending + content)
 * @param state - Estado mutavel
 * @returns Texto antes da tag ou null
 */
function handleTagStart(text: string, state: ToolCallExtractorState): string | null {
  state.insideToolCall = true
  state.hasToolCalls = true
  const startIdx = text.indexOf(TAG_START)
  const before = text.slice(0, startIdx)
  const after = text.slice(startIdx + TAG_START.length)
  state.buffer = after

  if (state.buffer.includes(TAG_END)) {
    const endIdx = state.buffer.indexOf(TAG_END)
    const tcText = state.buffer.slice(0, endIdx)
    const remaining = state.buffer.slice(endIdx + TAG_END.length)
    state.insideToolCall = false
    state.buffer = ''

    const parsed = parseToolCall(tcText)
    if (parsed) state.extractedCalls.push(parsed)

    if (remaining.trim()) {
      const more = processContent(remaining, state)
      const combined = (before || '') + (more || '')
      return combined.trim() ? combined : null
    }
  }

  return before.trim() ? before : null
}

/**
 * Processa conteudo quando estamos dentro de um [Calling tool: ...] bracket call.
 * @param content - Texto do chunk
 * @param state - Estado mutavel
 * @returns Texto ou null
 */
function handleInsideBracketCall(content: string, state: ToolCallExtractorState): string | null {
  state.buffer += content

  if (!state.buffer.includes(BRACKET_END)) return null

  const endIdx = state.buffer.indexOf(BRACKET_END)
  const tcText = state.buffer.slice(0, endIdx)
  const after = state.buffer.slice(endIdx + BRACKET_END.length)
  state.insideBracketCall = false
  state.buffer = ''

  const parsed = parseBracketFormat(tcText)
  if (parsed) state.extractedCalls.push(parsed)

  if (after.trim()) return processContent(after, state)
  return null
}

/**
 * Processa quando encontramos BRACKET_START no texto.
 * @param text - Texto completo (pending + content)
 * @param state - Estado mutavel
 * @returns Texto antes da tag ou null
 */
function handleBracketStart(text: string, state: ToolCallExtractorState): string | null {
  state.insideBracketCall = true
  state.hasToolCalls = true
  const startIdx = text.indexOf(BRACKET_START)
  const before = text.slice(0, startIdx)
  const after = text.slice(startIdx + BRACKET_START.length)
  state.buffer = after

  if (state.buffer.includes(BRACKET_END)) {
    const endIdx = state.buffer.indexOf(BRACKET_END)
    const tcText = state.buffer.slice(0, endIdx)
    const remaining = state.buffer.slice(endIdx + BRACKET_END.length)
    state.insideBracketCall = false
    state.buffer = ''

    const parsed = parseBracketFormat(tcText)
    if (parsed) state.extractedCalls.push(parsed)

    if (remaining.trim()) {
      const more = processContent(remaining, state)
      const combined = (before || '') + (more || '')
      return combined.trim() ? combined : null
    }
  }

  return before.trim() ? before : null
}

/**
 * Verifica se ha tag parcial no final do texto (XML ou bracket).
 * @param text - Texto a verificar
 * @param state - Estado mutavel
 * @returns Texto a emitir ou null
 */
function handlePartialTag(text: string, state: ToolCallExtractorState): string | null {
  // Verifica partial <tool_call>
  const maxXmlLen = Math.min(TAG_START.length - 1, text.length)
  for (let len = maxXmlLen; len > 0; len--) {
    const suffix = text.slice(-len)
    if (TAG_START.startsWith(suffix)) {
      state.pending = suffix
      const forward = text.slice(0, -len)
      return forward || null
    }
  }

  // Verifica partial [Calling tool:
  const maxBracketLen = Math.min(BRACKET_START.length - 1, text.length)
  for (let len = maxBracketLen; len > 0; len--) {
    const suffix = text.slice(-len)
    if (BRACKET_START.startsWith(suffix)) {
      state.pending = suffix
      const forward = text.slice(0, -len)
      return forward || null
    }
  }

  return text
}

/**
 * Aplica extrator a um chunk SSE.
 * @param chunk - Chunk SSE
 * @param state - Estado mutavel
 * @returns Chunk modificado ou null (suprimir)
 */
export function applyToChunk(
  chunk: OpenAIStreamChunk,
  state: ToolCallExtractorState,
): OpenAIStreamChunk | null {
  if (!chunk?.choices) return chunk

  let allSuppressed = true

  const choices = chunk.choices.map((choice) => {
    const content = choice.delta?.content
    if (content !== undefined && content !== null) {
      const result = processContent(content, state)
      if (result === null || result === '') {
        allSuppressed = true
        return { ...choice, delta: { ...choice.delta, content: null } }
      }
      allSuppressed = false
      return { ...choice, delta: { ...choice.delta, content: result } }
    }
    allSuppressed = false
    return choice
  })

  if (allSuppressed) {
    const shouldSuppress = choices.every(
      (c) => c.delta?.content === null && !c.delta?.tool_calls && !c.finish_reason,
    )
    if (shouldSuppress) return null
  }

  return { ...chunk, choices }
}

/**
 * Constroi chunk final com tool_calls estruturadas.
 * @param state - Estado com calls extraidas
 * @param chunkId - ID do chunk (opcional)
 * @param model - Nome do modelo (opcional)
 * @returns Chunk SSE com tool_calls
 */
export function buildToolCallsChunk(
  state: ToolCallExtractorState,
  chunkId?: string,
  model?: string,
): OpenAIStreamChunk {
  const toolCalls = state.extractedCalls.map((tc, i) => ({
    index: i,
    id: tc.id,
    type: 'function' as const,
    function: {
      name: tc.name,
      arguments:
        typeof tc.arguments === 'object' ? JSON.stringify(tc.arguments) : String(tc.arguments),
    },
  }))

  return {
    id: chunkId ?? `chatcmpl-${crypto.randomUUID().slice(0, 8)}`,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model: model ?? '',
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: null, tool_calls: toolCalls },
        finish_reason: 'tool_calls',
      },
    ],
  }
}

// ─── Parsers ───

const FUNC_REGEX = /<function=([^>]+)>/
const PARAM_REGEX = /<parameter=([^>]+)>\s*([\s\S]*?)\s*<\/parameter>/g

/**
 * Parseia uma tool call de texto XML ou JSON.
 * @param text - Texto entre <tool_call>...</tool_call>
 * @returns ParsedToolCall ou null
 */
function parseToolCall(text: string): ParsedToolCall | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  return parseXmlFormat(trimmed) ?? parseJsonFormat(trimmed)
}

/**
 * Parseia formato XML: <function=name><parameter=key>value</parameter></function>
 * @param text - Texto a parsear
 * @returns ParsedToolCall ou null
 */
function parseXmlFormat(text: string): ParsedToolCall | null {
  const funcMatch = FUNC_REGEX.exec(text)
  if (!funcMatch) return null

  const name = funcMatch[1].trim()
  const params: Record<string, unknown> = {}

  let match: RegExpExecArray | null = PARAM_REGEX.exec(text)
  while (match) {
    const paramName = match[1].trim()
    const paramValue = match[2].trim()
    params[paramName] = coerceValue(paramValue)
    match = PARAM_REGEX.exec(text)
  }

  return { id: `call_${crypto.randomUUID().slice(0, 8)}`, name, arguments: params }
}

/**
 * Parseia formato JSON: {"name": "...", "arguments": {...}}
 * @param text - Texto a parsear
 * @returns ParsedToolCall ou null
 */
function parseJsonFormat(text: string): ParsedToolCall | null {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    const name = (parsed['name'] ?? parsed['function'] ?? parsed['tool']) as string | undefined
    const args = (parsed['arguments'] ??
      parsed['parameters'] ??
      parsed['input'] ??
      parsed['args'] ??
      {}) as unknown

    if (!name) return null

    return {
      id: `call_${crypto.randomUUID().slice(0, 8)}`,
      name,
      arguments: typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {},
    }
  } catch {
    return null
  }
}

/**
 * Parseia formato bracket Qwen3: name({"arg":"val"})
 * O texto recebido é tudo após "[Calling tool: " e antes de ")]".
 * Exemplo: 'read_file({"path":"/some/file"}' → name="read_file", args={path:"/some/file"}
 * @param text - Texto entre BRACKET_START e BRACKET_END
 * @returns ParsedToolCall ou null
 */
function parseBracketFormat(text: string): ParsedToolCall | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const parenIdx = trimmed.indexOf('(')
  if (parenIdx === -1) return null

  const name = trimmed.slice(0, parenIdx).trim()
  if (!name) return null

  // Tudo após '(' é o JSON dos argumentos (sem o ')' final, já removido pelo BRACKET_END)
  const argsStr = trimmed.slice(parenIdx + 1).trim()

  try {
    const args = JSON.parse(argsStr) as Record<string, unknown>
    return {
      id: `call_${crypto.randomUUID().slice(0, 8)}`,
      name,
      arguments: typeof args === 'object' && args !== null ? args : {},
    }
  } catch {
    // Args malformados: retorna call sem argumentos
    return { id: `call_${crypto.randomUUID().slice(0, 8)}`, name, arguments: {} }
  }
}

/**
 * Coerce string para tipo adequado (number, boolean, string).
 * @param value - Valor string
 * @returns Valor tipado
 */
function coerceValue(value: string): unknown {
  if (/^\d+$/.test(value)) return parseInt(value, 10)
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value)
  if (value.toLowerCase() === 'true') return true
  if (value.toLowerCase() === 'false') return false
  return value
}
