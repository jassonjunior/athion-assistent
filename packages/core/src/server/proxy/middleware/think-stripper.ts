import type { OpenAIChatResponse, OpenAIStreamChunk } from '../types'

/** Regex para remover blocos <think>...</think>.
 * @constant {RegExp} THINK_REGEX - Regex para remover blocos <think>...</think>.
 * @example
 * const thinkRegex = /<think>[\s\S]*?<\/think>/g
 */
const THINK_REGEX = /<think>[\s\S]*?<\/think>/g

/** Tag de abertura.
 * @constant {string} THINK_OPEN - Tag de abertura.
 * @example
 * const thinkOpen = '<think>'
 */
const THINK_OPEN = '<think>'
/** Tag de fechamento.
 * @constant {string} THINK_CLOSE - Tag de fechamento.
 * @example
 * const thinkClose = '</think>'
 */
const THINK_CLOSE = '</think>'

/**
 * Remove tags <think>...</think> de um texto.
 * @param {string} text - Texto a processar
 * @returns {string} Texto sem blocos think
 */
export function stripThinkTags(text: string): string {
  return text.replace(THINK_REGEX, '').trim()
}

/**
 * Middleware non-streaming: remove think tags da resposta completa.
 * @param response - Resposta OpenAI
 * @returns Resposta sem think tags
 */
export function thinkStripper(response: OpenAIChatResponse): OpenAIChatResponse {
  const choices = response.choices.map((choice) => {
    const content = choice.message.content
    if (!content) return choice
    return {
      ...choice,
      message: { ...choice.message, content: stripThinkTags(content) },
    }
  })
  return { ...response, choices }
}

// ─── Streaming (stateful) ───

/** Estado do think stripper para streaming.
 * @typedef {Object} ThinkStripperState
 * @property {boolean} insideThink - Se esta dentro de um bloco think.
 * @property {string} buffer - Buffer do think stripper.
 * @example
 * const state: ThinkStripperState = { insideThink: false, buffer: '' }
 */
export interface ThinkStripperState {
  insideThink: boolean
  buffer: string
}

/**
 * Cria estado inicial do think stripper para streaming.
 * @returns ThinkStripperState
 */
export function createThinkStripperState(): ThinkStripperState {
  return { insideThink: false, buffer: '' }
}

/**
 * Processa conteudo texto do streaming, removendo blocos think.
 * Retorna o texto a emitir (pode ser vazio se dentro de think).
 * @param text - Texto do chunk
 * @param state - Estado mutavel do stripper
 * @returns Texto filtrado (string vazia se suprimido)
 */
export function processThinkContent(text: string, state: ThinkStripperState): string {
  state.buffer += text
  let output = ''

  while (state.buffer.length > 0) {
    if (state.insideThink) {
      const closeIdx = state.buffer.indexOf(THINK_CLOSE)
      if (closeIdx === -1) {
        // Ainda dentro do think, aguardar mais dados
        state.buffer = ''
        break
      }
      // Encontrou fechamento, pular conteudo think
      state.buffer = state.buffer.slice(closeIdx + THINK_CLOSE.length)
      state.insideThink = false
      continue
    }

    const openIdx = state.buffer.indexOf(THINK_OPEN)
    if (openIdx === -1) {
      // Sem tag think, verificar se ha tag parcial no final
      const partial = findPartialTag(state.buffer, THINK_OPEN)
      if (partial > 0) {
        output += state.buffer.slice(0, state.buffer.length - partial)
        state.buffer = state.buffer.slice(state.buffer.length - partial)
      } else {
        output += state.buffer
        state.buffer = ''
      }
      break
    }

    // Emitir texto antes da tag think
    output += state.buffer.slice(0, openIdx)
    state.buffer = state.buffer.slice(openIdx + THINK_OPEN.length)
    state.insideThink = true
  }

  return output
}

/**
 * Middleware streaming: aplica think stripper a um chunk SSE.
 * @param chunk - Chunk SSE
 * @param state - Estado mutavel do stripper
 * @returns Chunk processado
 */
export function thinkStripperStream(
  chunk: OpenAIStreamChunk,
  state: ThinkStripperState,
): OpenAIStreamChunk {
  if (!chunk.choices?.[0]?.delta?.content) return chunk

  const content = chunk.choices[0].delta.content
  if (!content) return chunk

  const filtered = processThinkContent(content, state)
  return {
    ...chunk,
    choices: [
      {
        ...chunk.choices[0],
        delta: { ...chunk.choices[0].delta, content: filtered },
      },
      ...chunk.choices.slice(1),
    ],
  }
}

/**
 * Verifica se o chunk ficou vazio apos think stripping.
 * @param chunk - Chunk SSE
 * @returns true se o chunk esta vazio e pode ser pulado
 */
export function isThinkStrippedEmpty(chunk: OpenAIStreamChunk): boolean {
  const delta = chunk.choices?.[0]?.delta
  if (!delta) return false
  // Chunk so tinha content e agora esta vazio
  return delta.content === '' && !delta.tool_calls && !chunk.choices[0].finish_reason
}

/**
 * Encontra quantos chars no final do texto podem ser inicio de uma tag parcial.
 * @param text - Texto a verificar
 * @param tag - Tag completa a procurar
 * @returns Quantidade de chars que podem ser tag parcial (0 se nenhum)
 */
function findPartialTag(text: string, tag: string): number {
  const maxCheck = Math.min(text.length, tag.length - 1)
  for (let len = maxCheck; len > 0; len--) {
    if (tag.startsWith(text.slice(-len))) {
      return len
    }
  }
  return 0
}
