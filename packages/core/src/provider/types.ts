/**
 * Evento emitido durante o streaming de uma resposta do LLM.
 * O streaming é uma sequência de eventos ordenados:
 * content* → tool_call? → tool_result? → finish | error
 */
export type StreamEvent =
  | { type: 'content'; content: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  | { type: 'tool_result'; id: string; result: unknown }
  | { type: 'finish'; usage: TokenUsage }
  | { type: 'error'; error: Error }

/**
 * Contagem de tokens consumidos numa chamada ao LLM.
 * Usado para controle de custos e gerenciamento de contexto.
 */
export interface TokenUsage {
  /** Tokens consumidos pelo prompt (entrada) */
  promptTokens: number
  /** Tokens gerados na resposta (saída) */
  completionTokens: number
  /** Soma de prompt + completion */
  totalTokens: number
}

/**
 * Informações sobre um provider de LLM registrado.
 * Usado para listar providers disponíveis na UI.
 */
export interface ProviderInfo {
  /** Identificador único (ex: 'openai', 'anthropic', 'vllm-mlx') */
  id: string
  /** Nome amigável para exibição (ex: 'OpenAI', 'Anthropic', 'vLLM-MLX') */
  name: string
  /** Se o provider roda localmente (true) ou na nuvem (false) */
  isLocal: boolean
}

/**
 * Informações sobre um modelo disponível.
 * Usado para listar modelos na UI e para configuração.
 */
export interface ModelInfo {
  /** Identificador do modelo (ex: 'gpt-4o', 'claude-sonnet-4-20250514') */
  id: string
  /** Nome amigável (ex: 'GPT-4o', 'Claude Sonnet') */
  name: string
  /** ID do provider dono deste modelo */
  providerId: string
  /** Tamanho da janela de contexto em tokens */
  contextLength: number
}

/**
 * Configuração para uma chamada de streaming ao LLM.
 * Contém tudo que o provider precisa para gerar uma resposta.
 */
/** Definicao de tool para o provider (formato AI SDK). */
export interface ProviderToolDef {
  description: string
  parameters: unknown
}

export interface StreamChatConfig {
  /** ID do provider a usar (ex: 'vllm-mlx', 'openai') */
  provider: string
  /** ID do modelo (ex: 'qwen3-coder-reap-40b-a3b', 'gpt-4o') */
  model: string
  /** Histórico de mensagens da conversa (content pode ser string ou array de parts para tool calls) */
  messages: Array<{
    role: 'user' | 'assistant' | 'system' | 'tool'
    content: string | unknown[]
  }>
  /** Tools disponiveis para function calling */
  tools?: Record<string, ProviderToolDef>
  /** Temperatura de geração (0 = determinístico, 2 = criativo) */
  temperature?: number
  /** Limite máximo de tokens na resposta */
  maxTokens?: number
  /** Signal para cancelar o streaming (ex: usuário pressionou Ctrl+C) */
  signal?: AbortSignal
}

/**
 * Estratégia de interrupção quando o usuário envia mensagem durante streaming.
 * - 'abort-resend': Cancela o stream atual, preserva resposta parcial, re-envia com nova mensagem
 * - 'queue': Espera o stream terminar e depois processa a nova mensagem
 */
export type InterruptStrategy = 'abort-resend' | 'queue'
