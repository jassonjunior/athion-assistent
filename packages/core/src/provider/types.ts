/** StreamEvent
 * Descrição: Evento emitido durante o streaming de uma resposta do LLM.
 * O streaming é uma sequência de eventos ordenados:
 * content* -> tool_call? -> tool_result? -> finish | error
 */
export type StreamEvent =
  | { type: 'content'; content: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; result: unknown }
  | { type: 'finish'; usage: TokenUsage }
  | { type: 'error'; error: Error }
  | { type: 'model_loading'; modelName: string }
  | { type: 'model_ready'; modelName: string }

/** TokenUsage
 * Descrição: Contagem de tokens consumidos numa chamada ao LLM.
 * Usado para controle de custos e gerenciamento de contexto.
 */
export interface TokenUsage {
  /** promptTokens
   * Descrição: Tokens consumidos pelo prompt (entrada)
   */
  promptTokens: number
  /** completionTokens
   * Descrição: Tokens gerados na resposta (saída)
   */
  completionTokens: number
  /** totalTokens
   * Descrição: Soma de promptTokens + completionTokens
   */
  totalTokens: number
}

/** ProviderInfo
 * Descrição: Informações sobre um provider de LLM registrado.
 * Usado para listar providers disponíveis na UI.
 */
export interface ProviderInfo {
  /** id
   * Descrição: Identificador único do provider (ex: 'openai', 'anthropic', 'vllm-mlx')
   */
  id: string
  /** name
   * Descrição: Nome amigável para exibição (ex: 'OpenAI', 'Anthropic', 'vLLM-MLX')
   */
  name: string
  /** isLocal
   * Descrição: Indica se o provider roda localmente (true) ou na nuvem (false)
   */
  isLocal: boolean
}

/** ModelInfo
 * Descrição: Informações sobre um modelo disponível.
 * Usado para listar modelos na UI e para configuração.
 */
export interface ModelInfo {
  /** id
   * Descrição: Identificador do modelo (ex: 'gpt-4o', 'claude-sonnet-4-20250514')
   */
  id: string
  /** name
   * Descrição: Nome amigável do modelo (ex: 'GPT-4o', 'Claude Sonnet')
   */
  name: string
  /** providerId
   * Descrição: ID do provider dono deste modelo
   */
  providerId: string
  /** contextLength
   * Descrição: Tamanho da janela de contexto em tokens
   */
  contextLength: number
}

/** ProviderToolDef
 * Descrição: Definição de tool para o provider no formato AI SDK.
 */
export interface ProviderToolDef {
  /** description
   * Descrição: Texto descritivo da tool para o LLM
   */
  description: string
  /** parameters
   * Descrição: Schema de parâmetros da tool
   */
  parameters: unknown
}

/** StreamChatConfig
 * Descrição: Configuração para uma chamada de streaming ao LLM.
 * Contém tudo que o provider precisa para gerar uma resposta.
 */
export interface StreamChatConfig {
  /** provider
   * Descrição: ID do provider a usar (ex: 'vllm-mlx', 'openai')
   */
  provider: string
  /** model
   * Descrição: ID do modelo (ex: 'qwen3-coder-reap-40b-a3b', 'gpt-4o')
   */
  model: string
  /** messages
   * Descrição: Histórico de mensagens da conversa (content pode ser string ou array de parts para tool calls)
   */
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: string | unknown[]
  }>
  /** tools
   * Descrição: Tools disponíveis para function calling
   */
  tools?: Record<string, ProviderToolDef>
  /** temperature
   * Descrição: Temperatura de geração (0 = determinístico, 2 = criativo)
   */
  temperature?: number
  /** maxTokens
   * Descrição: Limite máximo de tokens na resposta
   */
  maxTokens?: number
  /** signal
   * Descrição: Signal para cancelar o streaming (ex: usuário pressionou Ctrl+C)
   */
  signal?: AbortSignal
}

/** InterruptStrategy
 * Descrição: Estratégia de interrupção quando o usuário envia mensagem durante streaming.
 * - 'abort-resend': Cancela o stream atual, preserva resposta parcial, re-envia com nova mensagem
 * - 'queue': Espera o stream terminar e depois processa a nova mensagem
 */
export type InterruptStrategy = 'abort-resend' | 'queue'

/** GenerateConfig
 * Descrição: Configuração para chamada não-streaming ao LLM.
 * Usado para tarefas internas como sumarização de contexto.
 */
export interface GenerateConfig {
  /** provider
   * Descrição: ID do provider a usar
   */
  provider: string
  /** model
   * Descrição: ID do modelo a usar
   */
  model: string
  /** messages
   * Descrição: Mensagens para enviar ao LLM
   */
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
  }>
  /** temperature
   * Descrição: Temperatura de geração (opcional)
   */
  temperature?: number
  /** maxTokens
   * Descrição: Limite máximo de tokens na resposta (opcional)
   */
  maxTokens?: number
}

/** GenerateResult
 * Descrição: Resultado de uma chamada não-streaming ao LLM.
 */
export interface GenerateResult {
  /** text
   * Descrição: Texto gerado pelo LLM
   */
  text: string
  /** usage
   * Descrição: Contagem de tokens consumidos na chamada
   */
  usage: TokenUsage
}
