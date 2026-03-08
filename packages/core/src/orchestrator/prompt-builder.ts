import type { SkillManager } from '../skills/types'
import type { ToolDefinition } from '../tools/types'
import type { AgentDefinition, Session } from './types'

/**
 * Interface do PromptBuilder.
 * Constroi o system prompt completo para o LLM.
 * @param session - Sessao atual
 * @param tools - Tools disponiveis
 * @param agents - Agentes disponiveis
 * @returns System prompt completo
 */
export interface PromptBuilder {
  /**
   * Monta system prompt com contexto da sessao, tools e skills
   * @param session - Sessao atual
   * @param tools - Tools disponiveis
   * @param agents - Agentes disponiveis
   * @returns System prompt completo
   */
  build(session: Session, tools: ToolDefinition[], agents: AgentDefinition[]): string
}

/**
 * Cria uma instancia do PromptBuilder.
 * Combina identidade do assistente, tools disponiveis, agentes e skills ativas.
 * @param skills - SkillManager para buscar skills relevantes
 * @returns Instancia do PromptBuilder
 */
export function createPromptBuilder(skills: SkillManager): PromptBuilder {
  function build(session: Session, tools: ToolDefinition[], agents: AgentDefinition[]): string {
    const sections: string[] = []

    sections.push(buildIdentity())
    sections.push(buildToolsSection(tools))

    if (agents.length > 0) {
      sections.push(buildAgentsSection(agents))
    }

    const activeSkills = skills.list()
    if (activeSkills.length > 0) {
      sections.push(buildSkillsSection(activeSkills))
    }

    sections.push(buildSessionContext(session))

    return sections.join('\n\n')
  }

  return { build }
}
/**
 * Identidade base do assistente.
 * @returns Identidade base do assistente
 */
function buildIdentity(): string {
  return `You are Athion, an AI coding assistant.
You help developers with software engineering tasks: writing code, debugging, refactoring, and more.
Always be concise and direct. Prefer code over explanation.
Respond in the same language the user writes in.`
}

/**
 * Lista de tools disponiveis para o LLM.
 * @param tools - Tools disponiveis
 * @returns Lista de tools disponiveis para o LLM
 */
function buildToolsSection(tools: ToolDefinition[]): string {
  const toolList = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')
  return `# Available Tools\n${toolList}`
}

/**
 * Lista de subagentes disponiveis via task tool.
 * @param agents - Agentes disponiveis
 * @returns Lista de subagentes disponiveis via task tool
 */
function buildAgentsSection(agents: AgentDefinition[]): string {
  const agentList = agents
    .map((a) => `- ${a.name}: ${a.description} (tools: ${a.tools.join(', ')})`)
    .join('\n')
  return `# Available Agents\nUse the "task" tool to delegate to these agents:\n${agentList}`
}

/**
 * Skills ativas com suas instrucoes.
 * @param activeSkills - Skills ativas
 * @returns Skills ativas com suas instrucoes
 */
function buildSkillsSection(activeSkills: Array<{ name: string; instructions: string }>): string {
  const skillBlocks = activeSkills.map((s) => `## Skill: ${s.name}\n${s.instructions}`).join('\n\n')
  return `# Active Skills\n${skillBlocks}`
}

/**
 * Contexto da sessao atual.
 * @param session - Sessao atual
 * @returns Contexto da sessao atual
 */
function buildSessionContext(session: Session): string {
  return `# Session\nProject: ${session.projectId}\nSession: ${session.id}`
}
