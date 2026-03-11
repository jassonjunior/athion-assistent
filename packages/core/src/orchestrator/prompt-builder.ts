import type { SkillManager } from '../skills/types'
import type { ToolDefinition } from '../tools/types'
import { isOrchestratorTool } from '../tools/types'
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

    // Só injeta a skill explicitamente ativa pelo usuário (se houver).
    // Não inclui todas as skills — isso inflaria o contexto desnecessariamente.
    const activeSkill = skills.getActive()
    if (activeSkill) {
      sections.push(buildActiveSkillSection(activeSkill))
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
 *
 * Usa o campo `level` de cada tool para decidir visibilidade:
 * - level='orchestrator' → aparece no prompt (task, plugin tools)
 * - level='agent' → NÃO aparece (core tools como read_file, write_file)
 *
 * @param tools - Todas as tools registradas no registry
 * @returns Seção do prompt listando tools acessíveis
 */
function buildToolsSection(tools: ToolDefinition[]): string {
  // Filtra: só tools com level='orchestrator' (ou sem level definido, que defaulta para orchestrator)
  const directTools = tools.filter((t) => isOrchestratorTool(t))
  if (directTools.length === 0) return ''

  const toolList = directTools.map((t) => `- ${t.name}: ${t.description}`).join('\n')

  const hasPluginTools = directTools.some((t) => t.name !== 'task')

  let instructions = `# Available Tools\n${toolList}\n\n`

  if (hasPluginTools) {
    instructions += `You can call these tools directly. For complex coding tasks (reading files, writing code, searching), delegate to agents via the "task" tool.
When a tool result comes back, present it to the user. Do NOT re-call the same tool unnecessarily.`
  } else {
    instructions += `IMPORTANT: You can ONLY use the "task" tool. You do NOT have direct access to file system tools (no read_file, write_file, list_files, run_command, search_files).
All work must be delegated to agents via the "task" tool. When the task result comes back, present it to the user as your final answer.
Do NOT try to call task again for the same work — trust the agent's result.`
  }

  return instructions
}

/**
 * Lista de subagentes disponiveis via task tool.
 * @param agents - Agentes disponiveis
 * @returns Lista de subagentes disponiveis via task tool
 */
function buildAgentsSection(agents: AgentDefinition[]): string {
  const agentList = agents.map((a) => `- "${a.name}": ${a.description}`).join('\n')
  return `# Available Agents
Delegate work using the "task" tool. You MUST use the agent names EXACTLY as shown (in quotes below). Do not invent, abbreviate, or vary the names.

${agentList}

Rules:
- Use "search" for any codebase analysis, code reading, or investigation tasks
- Use "coder" for writing or modifying files
- Use "explainer" for explaining code or concepts
- Use "code-review" for reviewing code quality
- After an agent completes, use its result to answer the user. Do not re-run the same task.`
}

/**
 * Skill explicitamente ativada pelo usuário — injetada com destaque máximo.
 */
function buildActiveSkillSection(skill: {
  name: string
  description: string
  instructions: string
}): string {
  return `# ACTIVE SKILL: ${skill.name}
The user has explicitly activated the "${skill.name}" skill for this interaction.
You MUST follow these instructions precisely:

${skill.instructions}

This is your primary directive for this conversation. Apply it to every response.`
}

/**
 * Contexto da sessao atual.
 * @param session - Sessao atual
 * @returns Contexto da sessao atual
 */
function buildSessionContext(session: Session): string {
  return `# Session\nProject: ${session.projectId}\nSession: ${session.id}`
}
