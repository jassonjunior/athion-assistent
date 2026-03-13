import ptBR from './locales/pt-BR.json'
import enUS from './locales/en-US.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import zhCN from './locales/zh-CN.json'

/** SupportedLocale
 * Descrição: Union type com os locales (idiomas) suportados pelo sistema de internacionalização
 */
export type SupportedLocale = 'pt-BR' | 'en-US' | 'es' | 'fr' | 'zh-CN'

/** LOCALES
 * Descrição: Mapa de todos os locales suportados para seus respectivos arquivos de tradução
 */
const LOCALES: Record<SupportedLocale, typeof ptBR> = {
  'pt-BR': ptBR,
  'en-US': enUS,
  es: es,
  fr: fr,
  'zh-CN': zhCN,
}

/** detectLocale
 * Descrição: Detecta automaticamente o locale do sistema operacional (Node.js ou Browser)
 * @returns O locale detectado do ambiente, com fallback para 'pt-BR'
 */
function detectLocale(): SupportedLocale {
  // Browser (VSCode webview, Desktop)
  if (typeof navigator !== 'undefined' && navigator.language) {
    const lang = navigator.language
    if (lang.startsWith('pt')) return 'pt-BR'
    if (lang.startsWith('es')) return 'es'
    if (lang.startsWith('fr')) return 'fr'
    if (lang.startsWith('zh')) return 'zh-CN'
    if (lang.startsWith('en')) return 'en-US'
    return 'pt-BR'
  }

  // Node.js (CLI)
  const env =
    (typeof process !== 'undefined' ? process.env['LANG'] : undefined) ??
    (typeof process !== 'undefined' ? process.env['LC_ALL'] : undefined) ??
    (typeof process !== 'undefined' ? process.env['LC_MESSAGES'] : undefined) ??
    ''

  const normalized = env.replace('_', '-').split('.')[0] ?? ''
  if (normalized in LOCALES) return normalized as SupportedLocale
  if (normalized.startsWith('pt')) return 'pt-BR'
  if (normalized.startsWith('en')) return 'en-US'
  if (normalized.startsWith('es')) return 'es'
  if (normalized.startsWith('fr')) return 'fr'
  if (normalized.startsWith('zh')) return 'zh-CN'

  return 'pt-BR' // default
}

/** interpolate
 * Descrição: Substitui placeholders {{key}} em uma string template com os valores fornecidos
 * @param template - String com placeholders no formato {{chave}}
 * @param vars - Objeto com os valores para substituição
 * @returns String com os placeholders substituídos pelos valores correspondentes
 */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? `{{${key}}}`))
}

/** currentLocale
 * Descrição: Singleton que armazena o locale atualmente ativo no sistema de i18n
 */
let currentLocale: SupportedLocale | null = null

/** initI18n
 * Descrição: Inicializa o sistema de internacionalização com um locale específico ou detecta automaticamente
 * @param locale - Locale opcional a ser definido; se omitido, detecta automaticamente do ambiente
 */
export function initI18n(locale?: SupportedLocale | string): void {
  if (locale && locale in LOCALES) {
    currentLocale = locale as SupportedLocale
    return
  }
  // Normaliza locale parcial (ex: "pt" → "pt-BR", "en" → "en-US")
  if (locale) {
    if (locale.startsWith('pt')) {
      currentLocale = 'pt-BR'
      return
    }
    if (locale.startsWith('es')) {
      currentLocale = 'es'
      return
    }
    if (locale.startsWith('fr')) {
      currentLocale = 'fr'
      return
    }
    if (locale.startsWith('zh')) {
      currentLocale = 'zh-CN'
      return
    }
    if (locale.startsWith('en')) {
      currentLocale = 'en-US'
      return
    }
  }
  currentLocale = detectLocale()
}

/** setLocale
 * Descrição: Define o locale ativo diretamente (alias de initI18n para maior clareza semântica)
 * @param locale - Locale a ser definido como ativo
 */
export function setLocale(locale: SupportedLocale | string): void {
  initI18n(locale)
}

/** getLocale
 * Descrição: Retorna o locale atualmente ativo no sistema de i18n
 * @returns O locale ativo, ou detecta automaticamente caso não tenha sido inicializado
 */
export function getLocale(): SupportedLocale {
  return currentLocale ?? detectLocale()
}

/** DeepRecordValue
 * Descrição: Tipo recursivo que representa os valores possíveis dentro de um objeto de traduções aninhado
 */
type DeepRecordValue = string | string[] | { [key: string]: DeepRecordValue }

/** DeepRecord
 * Descrição: Tipo que representa um objeto de traduções com chaves string e valores aninhados recursivamente
 */
type DeepRecord = { [key: string]: DeepRecordValue }

/** resolve
 * Descrição: Navega em um objeto aninhado usando notação de ponto (dot-notation) para encontrar um valor
 * @param obj - Objeto de traduções aninhado
 * @param key - Chave em notação de ponto (ex: 'cli.chat.start')
 * @returns O valor encontrado ou undefined se a chave não existir
 */
function resolve(obj: DeepRecord, key: string): DeepRecordValue | undefined {
  const parts = key.split('.')
  let current: DeepRecordValue = obj
  for (const part of parts) {
    if (typeof current !== 'object' || Array.isArray(current) || !(part in current))
      return undefined
    const next: DeepRecordValue | undefined = (current as DeepRecord)[part]
    if (next === undefined) return undefined
    current = next
  }
  return current
}

/** t
 * Descrição: Traduz uma chave de mensagem para o locale atualmente ativo
 * @param key - Chave da mensagem em notação de ponto (ex: 'cli.chat.start')
 * @param vars - Variáveis opcionais para interpolação nos placeholders {{chave}}
 * @returns A string traduzida, ou a própria chave se a tradução não for encontrada
 * @example t('cli.chat.start')  →  "Iniciando chat..."
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const locale = getLocale()
  const messages = LOCALES[locale] as unknown as DeepRecord
  const value = resolve(messages, key)
  const template = typeof value === 'string' ? value : key
  return vars ? interpolate(template, vars) : template
}

/** ta
 * Descrição: Traduz uma chave que aponta para um array de strings no locale atualmente ativo
 * @param key - Chave da mensagem em notação de ponto que aponta para um array
 * @returns Array de strings traduzidas, ou array vazio se não encontrado
 * @example ta('feedback.loading_phrases')  →  ["Calibrando...", "Tentando sair do Vim...", ...]
 */
export function ta(key: string): string[] {
  const locale = getLocale()
  const messages = LOCALES[locale] as unknown as DeepRecord
  const value = resolve(messages, key)
  if (Array.isArray(value)) return value as string[]

  // Fallback para pt-BR
  const fallback = resolve(LOCALES['pt-BR'] as unknown as DeepRecord, key)
  if (Array.isArray(fallback)) return fallback as string[]

  return []
}
