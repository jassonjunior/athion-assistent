import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'
import type { ModelInfo, ProviderInfo } from './types'

/**
 * Configuração de um provider registrado.
 * Contém a factory do Vercel AI SDK e metadados.
 */
interface ProviderEntry {
  /** Metadados do provider (id, nome, isLocal) */
  info: ProviderInfo
  /** Factory que cria a instância do Vercel AI SDK para este provider */
  createModel: (modelId: string) => ReturnType<ReturnType<typeof createOpenAI>>
  /** Modelos disponíveis neste provider */
  models: ModelInfo[]
}

/**
 * Registro de todos os providers LLM disponíveis.
 * Cada provider tem uma factory que cria instâncias do Vercel AI SDK.
 *
 * Providers suportados:
 * - **vllm-mlx**: vLLM rodando localmente via MLX (Apple Silicon) — API compatível com OpenAI
 * - **ollama**: Ollama rodando localmente — API compatível com OpenAI
 * - **openai**: OpenAI cloud (GPT-4o, GPT-4o-mini)
 * - **anthropic**: Anthropic cloud (Claude Sonnet, Haiku)
 * - **google**: Google AI (Gemini Pro, Flash)
 * - **openrouter**: OpenRouter — gateway para múltiplos providers
 */
export const PROVIDERS: Record<string, ProviderEntry> = {
  'vllm-mlx': {
    info: { id: 'vllm-mlx', name: 'vLLM-MLX', isLocal: true },
    createModel: (modelId: string) => {
      const provider = createOpenAI({
        baseURL: process.env['ATHION_VLLM_MLX_URL'] ?? 'http://localhost:8000/v1',
        apiKey: 'not-needed',
      })
      return provider.chat(modelId)
    },
    models: [
      {
        id: 'Qwen3-Coder-Next-REAP-40B-A3B-mlx-mxfp4',
        name: 'Qwen3 Coder REAP 40B',
        providerId: 'vllm-mlx',
        contextLength: 50000,
      },
      {
        id: 'Qwen3.5-35B-A3B-4bit',
        name: 'Qwen3.5 35B A3B',
        providerId: 'vllm-mlx',
        contextLength: 50000,
      },
    ],
  },

  ollama: {
    info: { id: 'ollama', name: 'Ollama', isLocal: true },
    createModel: (modelId: string) => {
      const provider = createOpenAI({
        baseURL: process.env['ATHION_OLLAMA_URL'] ?? 'http://localhost:11434/v1',
        apiKey: 'ollama',
      })
      return provider.chat(modelId)
    },
    models: [
      {
        id: 'qwen2.5-coder:7b',
        name: 'Qwen 2.5 Coder 7B',
        providerId: 'ollama',
        contextLength: 32768,
      },
    ],
  },

  openai: {
    info: { id: 'openai', name: 'OpenAI', isLocal: false },
    createModel: (modelId: string) => {
      const provider = createOpenAI({
        apiKey: process.env['ATHION_OPENAI_API_KEY'] ?? '',
      })
      return provider(modelId)
    },
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', providerId: 'openai', contextLength: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', providerId: 'openai', contextLength: 128000 },
    ],
  },

  anthropic: {
    info: { id: 'anthropic', name: 'Anthropic', isLocal: false },
    createModel: (modelId: string) => {
      const provider = createAnthropic({
        apiKey: process.env['ATHION_ANTHROPIC_API_KEY'] ?? '',
      })
      return provider(modelId) as ReturnType<ReturnType<typeof createOpenAI>>
    },
    models: [
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude Sonnet 4',
        providerId: 'anthropic',
        contextLength: 200000,
      },
      {
        id: 'claude-haiku-4-5-20251001',
        name: 'Claude Haiku 4.5',
        providerId: 'anthropic',
        contextLength: 200000,
      },
    ],
  },

  google: {
    info: { id: 'google', name: 'Google AI', isLocal: false },
    createModel: (modelId: string) => {
      const provider = createGoogleGenerativeAI({
        apiKey: process.env['ATHION_GOOGLE_API_KEY'] ?? '',
      })
      return provider(modelId) as ReturnType<ReturnType<typeof createOpenAI>>
    },
    models: [
      {
        id: 'gemini-2.5-pro',
        name: 'Gemini 2.5 Pro',
        providerId: 'google',
        contextLength: 1000000,
      },
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        providerId: 'google',
        contextLength: 1000000,
      },
    ],
  },

  openrouter: {
    info: { id: 'openrouter', name: 'OpenRouter', isLocal: false },
    createModel: (modelId: string) => {
      const provider = createOpenAI({
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: process.env['ATHION_OPENROUTER_API_KEY'] ?? '',
      })
      return provider.chat(modelId)
    },
    models: [],
  },
}
