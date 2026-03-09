import type { MiddlewareResult, OpenAIChatRequest, OpenAIChatResponse } from '../types'

/** Patterns de comandos destrutivos.
 * @constant {RegExp[]} DESTRUCTIVE_PATTERNS - Patterns de comandos destrutivos.
 * @example
 * const destructivePatterns: RegExp[] = [
 *   /\brm\s+-rf\b/,
 *   /\brm\s+-r\b/,
 *   /\bgit\s+reset\s+--hard\b/,
 *   /\bgit\s+clean\s+-f\b/,
 *   /\bgit\s+push\s+--force\b/,
 */
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\brm\s+-rf\b/,
  /\brm\s+-r\b/,
  /\bgit\s+reset\s+--hard\b/,
  /\bgit\s+clean\s+-f\b/,
  /\bgit\s+push\s+--force\b/,
  /\bgit\s+push\s+-f\b/,
  /\bchmod\s+-R\s+777\b/,
  /\bmkfs\./,
  /\bdd\s+.*of=\/dev\//,
  /:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;?\s*:/,
]

/** Limite maximo de turns (tool calls) antes de forcar parada.
 * @constant {number} MAX_TURNS - Limite maximo de turns (tool calls) antes de forcar parada.
 * @example
 * const maxTurns = 15
 */
const MAX_TURNS = 25

/** Quantidade de repeticoes para detectar loop.
 * @constant {number} LOOP_THRESHOLD - Quantidade de repeticoes para detectar loop.
 * @example
 * const loopThreshold = 3
 */
const LOOP_THRESHOLD = 5

/**
 * Verifica se um comando e destrutivo.
 * @param command - Comando a verificar
 * @returns {boolean} true se destrutivo
 * @example
 * const command = 'rm -rf /'
 * const isDestructive = isDestructiveCommand(command)
 * console.log(isDestructive) // true
 */
export function isDestructiveCommand(command: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((p) => p.test(command))
}

/**
 * Extrai comandos dos argumentos de uma tool call.
 * @param args - Argumentos da tool call (JSON string ou objeto)
 * @returns {string[]} Lista de comandos encontrados
 * @example
 * const args = '{"command": "rm -rf /"}'
 * const commands = extractCommands(args)
 * console.log(commands) // ['rm -rf /']
 */
export function extractCommands(args: string): string[] {
  try {
    const parsed: unknown = JSON.parse(args)
    if (typeof parsed !== 'object' || parsed === null) return []
    const obj = parsed as Record<string, unknown>
    const commands: string[] = []
    for (const key of ['command', 'cmd', 'script', 'content']) {
      if (typeof obj[key] === 'string') commands.push(obj[key] as string)
    }
    return commands
  } catch {
    return []
  }
}

/**
 * Pre-check stateless: detecta loops e limita turns no historico.
 * @param body - Request OpenAI
 * @returns {MiddlewareResult} MiddlewareResult
 * @example
 * const body: OpenAIChatRequest = {
 *   messages: [{ role: 'user', content: 'Hello, how are you?' }],
 * }
 * const result = safetyGuardPreCheck(body)
 * console.log(result) // { blocked: false, data: {} as OpenAIChatResponse }
 */
export function safetyGuardPreCheck(body: OpenAIChatRequest): MiddlewareResult {
  const messages = body.messages
  const toolCallSignatures: string[] = []

  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        // Extrair target (path/file) dos args para comparar
        // Mesma tool para outro arquivo = chamada diferente (não é loop)
        const target = extractTarget(tc.function.name, tc.function.arguments ?? '')
        toolCallSignatures.push(`${tc.function.name}:${target}`)
      }
    }
  }

  // Detectar loops: mesma tool para o mesmo arquivo N+ vezes consecutivas
  const loopResult = detectLoop(toolCallSignatures)
  if (loopResult) {
    return { blocked: true, response: createBlockedResponse(loopResult) }
  }

  // Limite de turns
  if (toolCallSignatures.length >= MAX_TURNS) {
    return { blocked: true, response: createForceStopResponse() }
  }

  return { blocked: false, data: {} as OpenAIChatResponse }
}

/**
 * Pos-check: verifica se a resposta contem tool calls destrutivas.
 * @param response - Resposta OpenAI
 * @returns {MiddlewareResult} MiddlewareResult
 * @example
 * const response: OpenAIChatResponse = {
 *   choices: [{ message: { role: 'assistant', tool_calls: [{ function: { name: 'rm -rf /' } }] } }],
 * }
 * const result = safetyGuard(response)
 * console.log(result) // { blocked: false, data: response }
 */
export function safetyGuard(response: OpenAIChatResponse): MiddlewareResult {
  for (const choice of response.choices) {
    if (!choice.message.tool_calls) continue
    for (const tc of choice.message.tool_calls) {
      const commands = extractCommands(tc.function.arguments)
      for (const cmd of commands) {
        if (isDestructiveCommand(cmd)) {
          return {
            blocked: true,
            response: createBlockedResponse(`Destructive command blocked: ${cmd.slice(0, 80)}`),
          }
        }
      }
    }
  }
  return { blocked: false, data: response }
}

/**
 * Extrai o arquivo/path alvo dos argumentos de uma tool call.
 * Mesma tool para arquivo diferente = chamada diferente (não é loop).
 */
function extractTarget(_toolName: string, argsJson: string): string {
  try {
    const parsed = JSON.parse(argsJson) as Record<string, unknown>
    // Campos comuns que identificam o alvo
    for (const key of ['path', 'file', 'pattern', 'command', 'description']) {
      if (typeof parsed[key] === 'string') return parsed[key] as string
    }
    return argsJson
  } catch {
    return argsJson
  }
}

/**
 * Detecta se ha loop nas tool calls (mesma tool N+ vezes consecutivas).
 * @param names - Nomes das tool calls em ordem
 * @returns {string | null} Mensagem de loop ou null
 * @example
 * const names = ['rm -rf /', 'rm -rf /', 'rm -rf /']
 * const loop = detectLoop(names)
 * console.log(loop) // 'Loop detected: rm -rf / called 3x consecutively'
 */
function detectLoop(names: string[]): string | null {
  if (names.length < LOOP_THRESHOLD) return null

  const last = names.slice(-LOOP_THRESHOLD)
  const allSame = last.every((n) => n === last[0])
  if (allSame) {
    return `Loop detected: ${last[0]} called ${LOOP_THRESHOLD}x consecutively`
  }
  return null
}

/**
 * Cria resposta de bloqueio.
 * @param reason - Motivo do bloqueio
 * @returns {OpenAIChatResponse} OpenAIChatResponse
 * @example
 * const reason = 'Destructive command blocked: rm -rf /'
 * const response = createBlockedResponse(reason)
 * console.log(response) // { id: 'safety-guard', object: 'chat.completion', created: 1715395200, model: 'safety-guard', choices: [{ index: 0, message: { role: 'assistant', content: '[Safety Guard] Destructive command blocked: rm -rf /... Stopping to prevent damage.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }
 */
function createBlockedResponse(reason: string): OpenAIChatResponse {
  return {
    id: 'safety-guard',
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'safety-guard',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: `[Safety Guard] ${reason}. Stopping to prevent damage.`,
        },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

/**
 * Cria resposta de parada forcada por limite de turns.
 * @returns {OpenAIChatResponse} OpenAIChatResponse
 * @example
 * const response = createForceStopResponse()
 * console.log(response) // { id: 'safety-guard', object: 'chat.completion', created: 1715395200, model: 'safety-guard', choices: [{ index: 0, message: { role: 'assistant', content: '[Safety Guard] Turn limit reached (15). Forcing stop. Stopping to prevent damage.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }
 */
function createForceStopResponse(): OpenAIChatResponse {
  return createBlockedResponse(`Turn limit reached (${MAX_TURNS}). Forcing stop`)
}
