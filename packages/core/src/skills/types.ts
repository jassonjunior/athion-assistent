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
  loadFromDirectory(dirPath: string): Promise<number>
  register(skill: SkillDefinition): void
  unregister(name: string): void
  get(name: string): SkillDefinition | undefined
  findByTrigger(input: string): SkillDefinition[]
  list(): SkillDefinition[]
  setActive(name: string): void
  getActive(): SkillDefinition | undefined
  clearActive(): void
}

/** Entrada no catálogo de skills (local ou remoto). */
export interface SkillRegistryEntry {
  name: string
  description: string
  triggers: string[]
  tags: string[]
  author: string
  /** Repo de origem (ex: 'anthropics/skills') */
  source?: string
  /** Conteúdo .md embutido (para skills bundled). */
  content?: string
  /** URL para download (para skills da comunidade). */
  url?: string
}

/** Dados do registry (catálogo completo). */
export interface SkillRegistryData {
  version: number
  skills: SkillRegistryEntry[]
}

/** Resultado de busca — pode vir do local ou do GitHub. */
export interface SkillSearchResult {
  name: string
  description: string
  source: string
  installed: boolean
  /** Repo GitHub de origem (ex: 'anthropics/skills') */
  repo?: string
}

/** Interface do Skill Registry — busca e instalação de skills. */
export interface SkillRegistry {
  /** Busca local no catálogo embutido. */
  search(query?: string): SkillRegistryEntry[]
  /** Busca remota no GitHub (repos conhecidos). */
  searchGitHub(query: string): Promise<SkillSearchResult[]>
  /** Lista skills do catálogo local. */
  listAvailable(): SkillRegistryEntry[]
  /** Instala skill — aceita nome simples ou 'owner/repo/skill-name'. */
  install(nameOrPath: string): Promise<{ success: boolean; error?: string }>
  /** Remove skill instalada. */
  uninstall(name: string): Promise<{ success: boolean; error?: string }>
  /** Verifica se uma skill está instalada. */
  isInstalled(name: string): boolean
}
