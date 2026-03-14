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

/** SubAgentManagerDeps
 * Descrição: Dependências do SubAgent Manager para criação e execução de subagentes.
 */
export interface SubAgentManagerDeps {
  /** config
   * Descrição: Gerenciador de configuração do sistema
   */
  config: ConfigManager
  /** provider
   * Descrição: Camada de abstração dos provedores LLM
   */
  provider: ProviderLayer
  /** tools
   * Descrição: Registro de ferramentas disponíveis
   */
  tools: ToolRegistry
  /** skills
   * Descrição: Gerenciador de skills (instruções especializadas)
   */
  skills: SkillManager
  /** summarizer
   * Descrição: Serviço de sumarização para compactar contexto dos subagentes via LLM (opcional)
   */
  summarizer?: SummarizationService | undefined
}

/** createSubAgentManager
 * Descrição: Cria uma instância do SubAgent Manager.
 * Centraliza registro, busca e execução de subagentes.
 * @param deps - Dependências injetadas
 * @returns Instância do SubAgentManager
 */
export function createSubAgentManager(deps: SubAgentManagerDeps): SubAgentManager {
  const agents = new Map<string, SubAgentConfig>()

  /** spawn
   * Descrição: Executa um subagente com uma task específica, montando as dependências necessárias
   * @param config - Configuração do subagente
   * @param task - Task a ser executada
   * @param signal - Signal para cancelamento (opcional)
   * @returns AsyncGenerator que emite SubAgentEvent
   */
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
      defaultModel: (deps.config.get('agentModel') ?? deps.config.get('model')) as string,
      maxTokens: (deps.config.get('maxTokens') ??
        deps.config.get('maxOutputTokens') ??
        8192) as number,
      summarizer: deps.summarizer,
    }

    yield* runSubAgent(config, task, subAgentDeps, signal)
  }

  /** list
   * Descrição: Lista todos os subagentes registrados com informações resumidas
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

  /** getAgent
   * Descrição: Busca um subagente pelo nome no registro interno
   * @param name - Nome do subagente
   * @returns SubAgentConfig ou undefined se não encontrado
   */
  function getAgent(name: string): SubAgentConfig | undefined {
    return agents.get(name)
  }

  /** registerAgent
   * Descrição: Registra um novo subagente no manager
   * @param config - Configuração completa do subagente a registrar
   */
  function registerAgent(config: SubAgentConfig): void {
    agents.set(config.name, config)
  }

  return { spawn, list, getAgent, registerAgent }
}
