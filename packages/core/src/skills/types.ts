/** SkillDefinition
 * Descrição: Definição completa de uma skill. Skills são extensões que adicionam
 * capacidades especializadas ao Athion. Podem ser definidas em arquivos .md ou
 * registradas programaticamente.
 */
export interface SkillDefinition {
  /** name
   * Descrição: Identificador único da skill (ex: 'commit', 'review-code')
   */
  name: string
  /** description
   * Descrição: Descrição curta do que a skill faz
   */
  description: string
  /** triggers
   * Descrição: Palavras-chave para ativação automática (ex: ['commit', 'commitar'])
   */
  triggers: string[]
  /** instructions
   * Descrição: Instruções/prompt que guiam o LLM quando a skill é ativada
   */
  instructions: string
  /** sourcePath
   * Descrição: Caminho do arquivo .md fonte (se carregada de arquivo)
   */
  sourcePath?: string
}

/** SkillManager
 * Descrição: Interface do Skill Manager. Centraliza discovery, registro e busca de skills.
 */
export interface SkillManager {
  /** loadFromDirectory
   * Descrição: Carrega skills de um diretório (busca arquivos .md recursivamente)
   * @param dirPath - Caminho do diretório a escanear
   * @returns Número de skills carregadas
   */
  loadFromDirectory(dirPath: string): Promise<number>
  /** register
   * Descrição: Registra uma skill programaticamente
   * @param skill - Definição completa da skill
   */
  register(skill: SkillDefinition): void
  /** unregister
   * Descrição: Remove uma skill pelo nome
   * @param name - Nome da skill a remover
   */
  unregister(name: string): void
  /** get
   * Descrição: Busca uma skill pelo nome exato
   * @param name - Nome da skill
   * @returns A definição da skill ou undefined se não encontrada
   */
  get(name: string): SkillDefinition | undefined
  /** findByTrigger
   * Descrição: Busca skills cujos triggers batem com o input do usuário
   * @param input - Texto do usuário para testar contra triggers
   * @returns Array de skills que batem com o input
   */
  findByTrigger(input: string): SkillDefinition[]
  /** list
   * Descrição: Lista todas as skills registradas
   * @returns Array com todas as definições de skills
   */
  list(): SkillDefinition[]
  /** setActive
   * Descrição: Define a skill ativa no momento
   * @param name - Nome da skill a ativar
   */
  setActive(name: string): void
  /** getActive
   * Descrição: Retorna a skill ativa no momento
   * @returns A definição da skill ativa ou undefined se nenhuma ativa
   */
  getActive(): SkillDefinition | undefined
  /** clearActive
   * Descrição: Remove a skill ativa, limpando o estado
   */
  clearActive(): void
}

/** SkillRegistryEntry
 * Descrição: Entrada no catálogo de skills (local ou remoto)
 */
export interface SkillRegistryEntry {
  /** name
   * Descrição: Identificador único da skill
   */
  name: string
  /** description
   * Descrição: Descrição curta da skill
   */
  description: string
  /** triggers
   * Descrição: Palavras-chave para ativação automática
   */
  triggers: string[]
  /** tags
   * Descrição: Tags de categorização para busca
   */
  tags: string[]
  /** author
   * Descrição: Autor da skill
   */
  author: string
  /** source
   * Descrição: Repositório de origem (ex: 'anthropics/skills')
   */
  source?: string
  /** content
   * Descrição: Conteúdo .md embutido (para skills bundled)
   */
  content?: string
  /** url
   * Descrição: URL para download (para skills da comunidade)
   */
  url?: string
}

/** SkillRegistryData
 * Descrição: Dados do registry (catálogo completo de skills disponíveis)
 */
export interface SkillRegistryData {
  /** version
   * Descrição: Versão do formato do catálogo
   */
  version: number
  /** skills
   * Descrição: Array de entradas do catálogo de skills
   */
  skills: SkillRegistryEntry[]
}

/** SkillSearchResult
 * Descrição: Resultado de busca de skills — pode vir do catálogo local ou do GitHub
 */
export interface SkillSearchResult {
  /** name
   * Descrição: Nome da skill encontrada
   */
  name: string
  /** description
   * Descrição: Descrição da skill encontrada
   */
  description: string
  /** source
   * Descrição: Origem do resultado ('bundled' ou 'github')
   */
  source: string
  /** installed
   * Descrição: Se a skill já está instalada no sistema
   */
  installed: boolean
  /** repo
   * Descrição: Repositório GitHub de origem (ex: 'anthropics/skills')
   */
  repo?: string
}

/** SkillRegistry
 * Descrição: Interface do Skill Registry — busca e instalação de skills
 */
export interface SkillRegistry {
  /** search
   * Descrição: Busca local no catálogo embutido de skills
   * @param query - Termo de busca (opcional, retorna tudo se omitido)
   * @returns Array de entradas do catálogo que batem com a busca
   */
  search(query?: string): SkillRegistryEntry[]
  /** searchGitHub
   * Descrição: Busca remota no GitHub em repositórios conhecidos de skills
   * @param query - Termo de busca
   * @returns Array de resultados de busca com status de instalação
   */
  searchGitHub(query: string): Promise<SkillSearchResult[]>
  /** listAvailable
   * Descrição: Lista todas as skills disponíveis no catálogo local
   * @returns Array de entradas do catálogo
   */
  listAvailable(): SkillRegistryEntry[]
  /** install
   * Descrição: Instala uma skill — aceita nome simples ou 'owner/repo/skill-name'
   * @param nameOrPath - Nome da skill ou caminho completo no formato owner/repo/skill
   * @returns Objeto com status de sucesso e mensagem de erro se falhar
   */
  install(nameOrPath: string): Promise<{ success: boolean; error?: string }>
  /** uninstall
   * Descrição: Remove uma skill instalada do sistema
   * @param name - Nome da skill a desinstalar
   * @returns Objeto com status de sucesso e mensagem de erro se falhar
   */
  uninstall(name: string): Promise<{ success: boolean; error?: string }>
  /** isInstalled
   * Descrição: Verifica se uma skill está instalada no sistema
   * @param name - Nome da skill
   * @returns true se a skill está instalada
   */
  isInstalled(name: string): boolean
}
