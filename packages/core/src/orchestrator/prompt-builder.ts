import type { SkillManager } from '../skills/types'
import type { ToolDefinition } from '../tools/types'
import { isOrchestratorTool } from '../tools/types'
import type { AgentDefinition, Session } from './types'

/** PromptBuilder
 * Descrição: Interface do PromptBuilder.
 * Constrói o system prompt completo para o LLM.
 */
export interface PromptBuilder {
  /** build
   * Descrição: Monta system prompt com contexto da sessão, tools e skills
   * @param session - Sessão atual
   * @param tools - Tools disponíveis
   * @param agents - Agentes disponíveis
   * @returns System prompt completo como string
   */
  build(session: Session, tools: ToolDefinition[], agents: AgentDefinition[]): string
}

/** createPromptBuilder
 * Descrição: Cria uma instância do PromptBuilder.
 * Combina identidade do assistente, tools disponíveis, agentes e skills ativas.
 * @param skills - SkillManager para buscar skills relevantes
 * @returns Instância do PromptBuilder
 */
export function createPromptBuilder(skills: SkillManager): PromptBuilder {
  /** build
   * Descrição: Constrói o system prompt concatenando seções de identidade, tools, agentes e contexto
   * @param session - Sessão atual
   * @param tools - Tools disponíveis
   * @param agents - Agentes disponíveis
   * @returns System prompt completo
   */
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

/** buildIdentity
 * Descrição: Gera a seção de identidade base do assistente Athion
 * @returns String com as instruções de identidade
 */
function buildIdentity(): string {
  return `You are Athion, an AI coding assistant.
You help developers with software engineering tasks: writing code, debugging, refactoring, and more.
Always be concise and direct. Prefer code over explanation.
IMPORTANT: You MUST ALWAYS respond in Brazilian Portuguese (pt-BR), regardless of the language the user writes in.`
}

/** buildToolsSection
 * Descrição: Lista de tools disponíveis para o LLM no system prompt.
 * Usa o campo `level` de cada tool para decidir visibilidade:
 * - level='orchestrator' aparece no prompt (task, plugin tools)
 * - level='agent' NÃO aparece (core tools como read_file, write_file)
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

/** buildAgentsSection
 * Descrição: Gera a seção do prompt que lista os subagentes disponíveis via task tool
 * @param agents - Agentes disponíveis
 * @returns Seção do prompt com lista e regras de uso dos agentes
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

/** buildActiveSkillSection
 * Descrição: Gera a seção do prompt para a skill explicitamente ativada pelo usuário
 * @param skill - Skill ativa com nome, descrição e instruções
 * @returns Seção do prompt com instruções da skill ativa
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

/** buildSessionContext
 * Descrição: Gera a seção de contexto da sessão atual no system prompt
 * @param session - Sessão atual
 * @returns Seção do prompt com ID do projeto e da sessão
 */
function buildSessionContext(session: Session): string {
  return `# Session\nProject: ${session.projectId}\nSession: ${session.id}`
}
