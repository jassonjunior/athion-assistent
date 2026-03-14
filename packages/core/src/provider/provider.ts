import { generateText as aiGenerateText, streamText, tool } from 'ai'
import { appendFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { PROVIDERS } from './registry'
import type {
  GenerateConfig,
  GenerateResult,
  ModelInfo,
  ProviderInfo,
  StreamChatConfig,
  StreamEvent,
  TokenUsage,
} from './types'

const LOG_FILE = join(homedir(), '.athion', 'athion.log')
const SEP = '════════════════════════════════════════════════════════════'
let requestCounter = 0

function logToFile(text: string): void {
  try {
    appendFileSync(LOG_FILE, text)
  } catch {
    // ignora
  }
}

function ts(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

function logRequest(
  config: {
    model: string
    messages?: unknown[]
    maxTokens?: number
    tools?: Record<string, { description: string }>
  },
  stream: boolean,
): number {
  const num = ++requestCounter
  const msgs = config.messages ?? []
  const toolNames = config.tools ? Object.keys(config.tools) : []
  let totalChars = 0
  for (const m of msgs) {
    const msg = m as Record<string, unknown>
    totalChars += typeof msg.content === 'string' ? msg.content.length : 80
  }
  const estTokens = Math.round(totalChars / 3.5)

  const lines: string[] = [
    SEP,
    `[${ts()}] → POST /v1/chat/completions  #${num}`,
    `model: ${config.model}`,
    `stream: ${stream} | max_tokens: ${config.maxTokens ?? 'default'}`,
    `messages: ${msgs.length} | tools: ${toolNames.length}`,
    `est. prompt tokens: ~${estTokens}`,
  ]

  if (toolNames.length > 0) {
    lines.push('', '─── TOOLS ───')
    for (const name of toolNames) {
      const desc = config.tools?.[name]?.description ?? ''
      lines.push(`  ${name} — ${desc.slice(0, 80)}`)
    }
  }

  lines.push('', '─── MESSAGES ───', '')
  for (let i = 0; i < msgs.length; i++) {
    const raw = msgs[i]
    if (!raw) continue
    const msg = raw as Record<string, unknown>
    const role = (msg.role as string) ?? 'unknown'
    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    lines.push(`[${i}] ${role} (${content.length} chars)`)
    lines.push('  ' + content.slice(0, 500) + (content.length > 500 ? '\n  ...(truncated)' : ''))
    lines.push('')
  }

  logToFile(lines.join('\n') + '\n')
  return num
}

function logStreamResponse(
  num: number,
  latencyMs: number,
  content: string,
  usage: TokenUsage,
): void {
  const total = usage.promptTokens + usage.completionTokens
  const lines: string[] = [
    '',
    '─── RESPONSE (STREAMING) ───',
    '',
    `[${ts()}] ← 200 STREAM (${latencyMs}ms)  #${num}`,
    '',
    content.slice(0, 2000) + (content.length > 2000 ? '\n  ...(truncated)' : ''),
    '',
    `tokens: ${usage.promptTokens} prompt + ${usage.completionTokens} completion = ${total}`,
    SEP,
    '',
  ]
  logToFile(lines.join('\n') + '\n')
}

function logGenerateResponse(
  num: number,
  latencyMs: number,
  text: string,
  usage: TokenUsage,
): void {
  const total = usage.promptTokens + usage.completionTokens
  const lines: string[] = [
    '',
    '─── RESPONSE ───',
    '',
    `[${ts()}] ← 200 (${latencyMs}ms)  #${num}`,
    '',
    text.slice(0, 2000) + (text.length > 2000 ? '\n  ...(truncated)' : ''),
    '',
    `tokens: ${usage.promptTokens} prompt + ${usage.completionTokens} completion = ${total}`,
    SEP,
    '',
  ]
  logToFile(lines.join('\n') + '\n')
}

/** ProviderLayer
 * Descrição: Interface pública do Provider Layer.
 * Abstração unificada para interagir com múltiplos provedores LLM.
 */
export interface ProviderLayer {
  /** listProviders
   * Descrição: Lista todos os providers registrados
   * @returns Lista de informações dos providers disponíveis
   */
  listProviders(): ProviderInfo[]
  /** listModels
   * Descrição: Lista modelos disponíveis, opcionalmente filtrados por provider
   * @param providerId - ID do provider para filtrar (opcional)
   * @returns Lista de informações dos modelos disponíveis
   */
  listModels(providerId?: string): ModelInfo[]
  /** streamChat
   * Descrição: Inicia streaming de chat com o LLM
   * @param config - Configuração da chamada de streaming
   * @returns AsyncGenerator que emite eventos de streaming
   */
  streamChat(config: StreamChatConfig): AsyncGenerator<StreamEvent>
  /** generateText
   * Descrição: Chamada não-streaming ao LLM. Útil para sumarização e tarefas internas.
   * @param config - Configuração da chamada
   * @returns Resultado com texto gerado e uso de tokens
   */
  generateText(config: GenerateConfig): Promise<GenerateResult>
}

/** createProviderLayer
 * Descrição: Cria uma instância do Provider Layer que abstrai múltiplos provedores LLM.
 * @returns Instância do ProviderLayer pronta para uso
 */
export function createProviderLayer(): ProviderLayer {
  /** listProviders
   * Descrição: Lista todos os providers registrados no sistema
   * @returns Array de ProviderInfo com metadados de cada provider
   */
  function listProviders(): ProviderInfo[] {
    return Object.values(PROVIDERS).map((entry) => entry.info)
  }

  /** listModels
   * Descrição: Lista modelos disponíveis, opcionalmente filtrados por provider
   * @param providerId - ID do provider para filtrar (opcional)
   * @returns Array de ModelInfo com metadados de cada modelo
   */
  function listModels(providerId?: string): ModelInfo[] {
    if (providerId) {
      return PROVIDERS[providerId]?.models ?? []
    }
    return Object.values(PROVIDERS).flatMap((entry) => entry.models)
  }

  /** streamChat
   * Descrição: Inicia streaming de chat com o LLM usando Vercel AI SDK
   * @param config - Configuração completa da chamada de streaming
   * @returns AsyncGenerator que emite StreamEvent durante a resposta
   */
  async function* streamChat(config: StreamChatConfig): AsyncGenerator<StreamEvent> {
    const entry = PROVIDERS[config.provider]
    if (!entry) {
      yield { type: 'error', error: new Error(`Provider '${config.provider}' not found`) }
      return
    }

    const reqNum = logRequest(config, true)
    const startTime = Date.now()
    const model = entry.createModel(config.model)
    const aiTools = convertTools(config.tools)
    let fullContent = ''

    try {
      const result = streamText({
        model,
        messages: config.messages,
        temperature: config.temperature,
        maxOutputTokens: config.maxTokens,
        abortSignal: config.signal,
        ...(aiTools ? { tools: aiTools } : {}),
      } as Parameters<typeof streamText>[0])

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          fullContent += part.text
          yield { type: 'content', content: part.text }
        } else if (part.type === 'tool-call') {
          yield {
            type: 'tool_call',
            id: part.toolCallId,
            name: part.toolName,
            args: part.input,
          }
        }
      }

      const usage = await result.usage
      const tokenUsage: TokenUsage = {
        promptTokens: usage.inputTokens ?? 0,
        completionTokens: usage.outputTokens ?? 0,
        totalTokens: 0,
      }
      tokenUsage.totalTokens = tokenUsage.promptTokens + tokenUsage.completionTokens

      logStreamResponse(reqNum, Date.now() - startTime, fullContent, tokenUsage)
      yield { type: 'finish', usage: tokenUsage }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      yield { type: 'error', error: error instanceof Error ? error : new Error(String(error)) }
    }
  }

  /** generateText
   * Descrição: Realiza chamada não-streaming ao LLM
   * @param config - Configuração da chamada com mensagens e parâmetros
   * @returns Resultado com texto gerado e contagem de tokens
   */
  async function generateText(config: GenerateConfig): Promise<GenerateResult> {
    const entry = PROVIDERS[config.provider]
    if (!entry) {
      throw new Error(`Provider '${config.provider}' not found`)
    }

    const reqNum = logRequest(config, false)
    const startTime = Date.now()
    const model = entry.createModel(config.model)

    const result = await aiGenerateText({
      model,
      messages: config.messages,
      temperature: config.temperature,
      maxOutputTokens: config.maxTokens,
    } as Parameters<typeof aiGenerateText>[0])

    const usage = result.usage
    const tokenUsage: TokenUsage = {
      promptTokens: usage.inputTokens ?? 0,
      completionTokens: usage.outputTokens ?? 0,
      totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    }

    logGenerateResponse(reqNum, Date.now() - startTime, result.text, tokenUsage)

    return { text: result.text, usage: tokenUsage }
  }

  return { listProviders, listModels, streamChat, generateText }
}

/** convertTools
 * Descrição: Converte tools do formato Athion para formato AI SDK.
 * @param tools - Mapa de tools no formato interno (opcional)
 * @returns Mapa de tools no formato AI SDK ou undefined se vazio
 */
function convertTools(
  tools?: Record<string, { description: string; parameters: unknown }>,
): Record<string, ReturnType<typeof tool>> | undefined {
  if (!tools || Object.keys(tools).length === 0) return undefined

  const result: Record<string, ReturnType<typeof tool>> = {}
  for (const [name, def] of Object.entries(tools)) {
    result[name] = tool({
      description: def.description,
      inputSchema: def.parameters as Parameters<typeof tool>[0]['inputSchema'],
    })
  }
  return result
}
