import { z } from 'zod/v4'

/** ConfigSchema
 * Descrição: Schema Zod que define e valida toda a configuração do Athion.
 * Inclui configurações de LLM, storage, permissões, telemetria, UI, proxy,
 * e múltiplos backends (vllm-mlx, mlx-omni, llama-cpp, lm-studio).
 */
export const ConfigSchema = z.object({
  // ─── LLM ────────────────────────────────────────────────────
  /** provider - Nome do provider LLM (default: 'vllm-mlx') */
  provider: z.string().default('vllm-mlx'),
  /** model - Identificador do modelo LLM a usar */
  model: z.string().default('Qwen3-Coder-Next-REAP-40B-A3B-mlx-mxfp4'),
  /** temperature - Temperatura para geração do LLM (0-2, default: 0.7) */
  temperature: z.number().min(0).max(2).default(0.7),
  /** maxTokens - Limite máximo de tokens de saída por chamada */
  maxTokens: z.number().optional(),

  // ─── Storage ────────────────────────────────────────────────
  /** dataDir - Diretório base para dados persistentes (default: '~/.athion') */
  dataDir: z.string().default('~/.athion'),
  /** dbPath - Caminho customizado do banco SQLite (sobrescreve dataDir) */
  dbPath: z.string().optional(),

  // ─── Permissions ────────────────────────────────────────────
  /** defaultPermission - Decisão padrão para ações sem regra: allow, ask ou deny */
  defaultPermission: z.enum(['allow', 'ask', 'deny']).default('ask'),

  // ─── Telemetry ──────────────────────────────────────────────
  /** telemetry - Habilita telemetria OpenTelemetry (opt-in, default: false) */
  telemetry: z.boolean().default(false),
  /** logLevel - Nível de log: debug, info, warn ou error */
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ─── UI ─────────────────────────────────────────────────────
  /** theme - Tema visual da interface (default: 'default') */
  theme: z.string().default('default'),
  /** language - Idioma da interface (default: 'pt-BR') */
  language: z.string().default('pt-BR'),

  // ─── Proxy ──────────────────────────────────────────────────
  /** proxyEnabled - Habilita o proxy reverso para o backend LLM */
  proxyEnabled: z.boolean().default(true),
  /** proxyPort - Porta do proxy reverso (default: 1236) */
  proxyPort: z.number().default(1236),
  /** backendPort - Porta do backend LLM (default: 8000) */
  backendPort: z.number().default(8000),
  /** contextWindow - Tamanho da janela de contexto em tokens (default: 50000) */
  contextWindow: z.number().default(50000),
  /** maxOutputTokens - Limite máximo de tokens de saída (default: 8192) */
  maxOutputTokens: z.number().default(8192),

  // ─── vllm-mlx ───────────────────────────────────────────────
  /** vllmAutoStart - Auto-iniciar o servidor vllm-mlx (default: true) */
  vllmAutoStart: z.boolean().default(true),
  /** vllmTtlMinutes - Tempo de inatividade antes de desligar o vllm (default: 30) */
  vllmTtlMinutes: z.number().default(30),

  // ─── mlx-omni ───────────────────────────────────────────────
  /** mlxOmniPort - Porta do servidor mlx-omni (default: 10240) */
  mlxOmniPort: z.number().default(10240).optional(),
  /** mlxOmniAutoStart - Auto-iniciar o servidor mlx-omni (default: true) */
  mlxOmniAutoStart: z.boolean().default(true).optional(),
  /** mlxOmniTtlMinutes - TTL de inatividade do mlx-omni em minutos (default: 30) */
  mlxOmniTtlMinutes: z.number().default(30).optional(),

  // ─── Model Swap ─────────────────────────────────────────────
  /** orchestratorModel - Modelo específico para o orquestrador (swap automático) */
  orchestratorModel: z.string().optional(),
  /** agentModel - Modelo específico para subagentes (swap automático) */
  agentModel: z.string().optional(),
  /** mlxOmniSingleModel - Desabilita swap quando dois modelos não cabem na memória */
  mlxOmniSingleModel: z.boolean().default(false).optional(),

  // ─── llama-cpp ──────────────────────────────────────────────
  /** llamaCppPort - Porta do llama-server (default: 8080) */
  llamaCppPort: z.number().default(8080).optional(),
  /** llamaCppHost - Host do llama-server (default: '127.0.0.1') */
  llamaCppHost: z.string().default('127.0.0.1').optional(),
  /** llamaCppAutoStart - Auto-iniciar o llama-server (default: true) */
  llamaCppAutoStart: z.boolean().default(true).optional(),
  /** llamaCppArgs - Argumentos extras para o llama-server */
  llamaCppArgs: z.array(z.string()).default([]).optional(),

  // ─── lm-studio ──────────────────────────────────────────────
  /** lmStudioPort - Porta da API do LM Studio (default: 1234) */
  lmStudioPort: z.number().default(1234).optional(),
  /** lmStudioHost - Host da API do LM Studio (default: '127.0.0.1') */
  lmStudioHost: z.string().default('127.0.0.1').optional(),
  /** lmStudioApiKey - Token da API do LM Studio (Settings > API > API Key) */
  lmStudioApiKey: z.string().optional(),
})

/** Config
 * Descrição: Tipo inferido do ConfigSchema Zod, representando toda a configuração do Athion.
 * Todas as chaves possuem valores default, exceto as marcadas como optional.
 */
export type Config = z.infer<typeof ConfigSchema>

/** DEFAULT_CONFIG
 * Descrição: Configuração padrão do Athion com todos os valores default aplicados.
 * Gerada automaticamente pelo parse do ConfigSchema com objeto vazio.
 */
export const DEFAULT_CONFIG: Config = ConfigSchema.parse({})
