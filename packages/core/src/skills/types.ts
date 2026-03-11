/**
 * Definição completa de uma skill.
 * Skills são extensões que adicionam capacidades especializadas ao Athion.
 * Podem ser definidas em arquivos .md ou registradas programaticamente.
 */
export interface SkillDefinition {
  /** Identificador único da skill (ex: 'commit', 'review-code') */
  name: string
  /** Descrição curta do que a skill faz */
  description: string
  /** Palavras-chave para ativação automática (ex: ['commit', 'commitar']) */
  triggers: string[]
  /** Instruções/prompt que guiam o LLM quando a skill é ativada */
  instructions: string
  /** Caminho do arquivo .md fonte (se carregada de arquivo) */
  sourcePath?: string
}

/**
 * Interface do Skill Manager.
 * Centraliza discovery, registro e busca de skills.
 */
export interface SkillManager {
  /**
   * Carrega skills de um diretório (busca arquivos .md recursivamente).
   * Cada arquivo .md é parseado para extrair metadados da skill.
   * @param dirPath - Caminho do diretório a escanear
   * @returns Número de skills carregadas
   */
  loadFromDirectory(dirPath: string): Promise<number>

  /**
   * Registra uma skill programaticamente.
   * @param skill - Definição completa da skill
   * @throws Se já existir uma skill com o mesmo nome
   */
  register(skill: SkillDefinition): void

  /**
   * Remove uma skill pelo nome.
   * @param name - Nome da skill a remover
   */
  unregister(name: string): void

  /**
   * Busca uma skill pelo nome exato.
   * @param name - Nome da skill
   * @returns A definição da skill ou undefined
   */
  get(name: string): SkillDefinition | undefined

  /**
   * Busca skills que batem com um trigger.
   * Útil para ativação automática baseada no input do usuário.
   * @param input - Texto do usuário para testar contra triggers
   * @returns Array de skills que batem com o input
   */
  findByTrigger(input: string): SkillDefinition[]

  /**
   * Lista todas as skills registradas.
   * @returns Array com todas as definições de skills
   */
  list(): SkillDefinition[]

  /**
   * Ativa uma skill explicitamente para uso na próxima interação.
   * A skill ativa é injetada com destaque no system prompt.
   * @param name - Nome da skill a ativar
   */
  setActive(name: string): void

  /**
   * Retorna a skill ativa no momento, ou undefined se nenhuma.
   */
  getActive(): SkillDefinition | undefined

  /**
   * Remove a skill ativa (volta ao modo automático por triggers).
   */
  clearActive(): void
}
