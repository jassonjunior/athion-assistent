import type { ConfigManager } from '../config/config'
import type { ProviderLayer } from '../provider/provider'
import type { SkillManager } from '../skills/types'
import type { SummarizationService } from '../tokens/summarize'
import type { ToolRegistry } from '../tools/types'
import type { SubAgentDeps } from './agent'
import { runSubAgent } from './agent'
import type {
  SubAgentConfig,
  SubAgentEvent,
  SubAgentInfo,
  SubAgentManager,
  SubAgentTask,
} from './types'

/**
 * Dependencias do SubAgent Manager.
 */
export interface SubAgentManagerDeps {
  config: ConfigManager
  provider: ProviderLayer
  tools: ToolRegistry
  skills: SkillManager
  /** Serviço de summarização para compactar contexto dos subagentes via LLM */
  summarizer?: SummarizationService | undefined
}

/**
 * Cria uma instancia do SubAgent Manager.
 * Centraliza registro, busca e execucao de subagentes.
 * @param deps - Dependencias injetadas
 * @returns Instancia do SubAgentManager
 */
export function createSubAgentManager(deps: SubAgentManagerDeps): SubAgentManager {
  const agents = new Map<string, SubAgentConfig>()

  async function* spawn(
    config: SubAgentConfig,
    task: SubAgentTask,
    signal?: AbortSignal,
  ): AsyncGenerator<SubAgentEvent> {
    const subAgentDeps: SubAgentDeps = {
      provider: deps.provider,
      tools: deps.tools,
      skills: deps.skills,
      defaultProvider: deps.config.get('provider') as string,
      defaultModel: deps.config.get('model') as string,
      summarizer: deps.summarizer,
    }

    yield* runSubAgent(config, task, subAgentDeps, signal)
  }

  /**
   * Lista todos os subagentes registrados
   * @returns Array de SubAgentInfo
   */
  function list(): SubAgentInfo[] {
    return Array.from(agents.values()).map((a) => ({
      name: a.name,
      description: a.description,
      skill: a.skill,
      tools: a.tools,
      level: a.level,
    }))
  }

  /**
   * Busca um subagente pelo nome
   * @param name - Nome do subagente
   * @returns SubAgentConfig ou undefined
   */
  function getAgent(name: string): SubAgentConfig | undefined {
    return agents.get(name)
  }

  /**
   * Registra um novo subagente
   * @param config - Configuracao do subagente
   */
  function registerAgent(config: SubAgentConfig): void {
    agents.set(config.name, config)
  }

  return { spawn, list, getAgent, registerAgent }
}
