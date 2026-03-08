import { z } from 'zod/v4'

/**
 * Schema de configuração do Athion
 * @returns {z.ZodObject<Config>} Schema de configuração do Athion
 * @example
 * const config = ConfigSchema.parse({
 *   provider: 'vllm-mlx',
 *   model: 'qwen3-coder-reap-40b-a3b',
 *   temperature: 0.7,
 *   maxTokens: 1000,
 *   dataDir: '~/.athion',
 *   dbPath: '~/.athion/db.sqlite',
 *   defaultPermission: 'ask',
 *   telemetry: false,
 *   logLevel: 'info',
 *   theme: 'default',
 *   language: 'pt-BR',
 * })
 */
export const ConfigSchema = z.object({
  // LLM
  provider: z.string().default('vllm-mlx'),
  model: z.string().default('qwen3-coder-reap-40b-a3b'),
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
})

/**
 * Tipo de configuração do Athion
 * @returns {z.infer<typeof ConfigSchema>} Tipo de configuração do Athion
 * @example
 * const config: Config = {
 *   telemetry: false,
 *   logLevel: 'info',
 *   theme: 'default',
 *   language: 'pt-BR',
 * }
 */
export type Config = z.infer<typeof ConfigSchema>

/**
 * Configuração padrão do Athion
 * @returns {Config} Configuração padrão do Athion
 * @example
 * const defaultConfig: Config = {
 *   telemetry: false,
 *   logLevel: 'info',
 *   theme: 'default',
 *   language: 'pt-BR',
 * }
 */
export const DEFAULT_CONFIG: Config = ConfigSchema.parse({})
