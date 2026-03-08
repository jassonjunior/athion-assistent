import { z } from 'zod/v4'

/** Schema de configuracao do proxy.
 * @typedef {Object} ConfigSchema
 * @property {string} provider - Provider do LLM
 * @property {string} model - Modelo do LLM
 * @property {number} temperature - Temperatura do LLM
 * @property {number} maxTokens - Limite de tokens do LLM
 * @property {string} dataDir - Diretorio de dados
 * @property {string} dbPath - Caminho do banco de dados
 */
export const ConfigSchema = z.object({
  // LLM
  provider: z.string().default('vllm-mlx'),
  model: z.string().default('Qwen3-Coder-Next-REAP-40B-A3B-mlx-mxfp4'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().optional(),

  // Storage
  dataDir: z.string().default('~/.athion'),
  dbPath: z.string().optional(),

  // Permissions
  defaultPermission: z.enum(['allow', 'ask', 'deny']).default('ask'),

  // Telemetry
  telemetry: z.boolean().default(false),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // UI
  theme: z.string().default('default'),
  language: z.string().default('pt-BR'),

  // Proxy
  proxyEnabled: z.boolean().default(true),
  proxyPort: z.number().default(1236),
  backendPort: z.number().default(8000),
  contextWindow: z.number().default(85000),
  maxOutputTokens: z.number().default(8192),

  // vllm-mlx
  vllmAutoStart: z.boolean().default(true),
  vllmTtlMinutes: z.number().default(30),
})

/** Tipo de configuracao.
 * @typedef {z.infer<typeof ConfigSchema>} Config
 * @example
 * const config: Config = ConfigSchema.parse({})
 * console.log(config) // { provider: 'vllm-mlx', model: 'Qwen3-Coder-Next-REAP-40B-A3B-mlx-mxfp4', temperature: 0.7, maxTokens: undefined, dataDir: '~/.athion', dbPath: undefined, defaultPermission: 'ask', telemetry: false, logLevel: 'info', theme: 'default', language: 'pt-BR', proxyEnabled: true, proxyPort: 1236, backendPort: 8000, contextWindow: 85000, maxOutputTokens: 8192, vllmAutoStart: true, vllmTtlMinutes: 30 }
 */
export type Config = z.infer<typeof ConfigSchema>

/** Configuracao padrao.
 * @typedef {Config} DEFAULT_CONFIG
 * @example
 * const config: Config = DEFAULT_CONFIG
 * console.log(config) // { provider: 'vllm-mlx', model: 'Qwen3-Coder-Next-REAP-40B-A3B-mlx-mxfp4', temperature: 0.7, maxTokens: undefined, dataDir: '~/.athion', dbPath: undefined, defaultPermission: 'ask', telemetry: false, logLevel: 'info', theme: 'default', language: 'pt-BR', proxyEnabled: true, proxyPort: 1236, backendPort: 8000, contextWindow: 85000, maxOutputTokens: 8192, vllmAutoStart: true, vllmTtlMinutes: 30 }
 */
export const DEFAULT_CONFIG: Config = ConfigSchema.parse({})
