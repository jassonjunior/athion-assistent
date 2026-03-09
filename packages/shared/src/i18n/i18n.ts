import ptBR from './locales/pt-BR.json'
import enUS from './locales/en-US.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import zhCN from './locales/zh-CN.json'

/** Locales suportados */
export type SupportedLocale = 'pt-BR' | 'en-US' | 'es' | 'fr' | 'zh-CN'

const LOCALES: Record<SupportedLocale, typeof ptBR> = {
  'pt-BR': ptBR,
  'en-US': enUS,
  es: es,
  fr: fr,
  'zh-CN': zhCN,
}

/** Resolve o locale do sistema operacional */
function detectLocale(): SupportedLocale {
  const env = process.env.LANG ?? process.env.LC_ALL ?? process.env.LC_MESSAGES ?? ''
  const normalized = env.replace('_', '-').split('.')[0]

  if (normalized in LOCALES) return normalized as SupportedLocale
  if (normalized.startsWith('pt')) return 'pt-BR'
  if (normalized.startsWith('en')) return 'en-US'
  if (normalized.startsWith('es')) return 'es'
  if (normalized.startsWith('fr')) return 'fr'
  if (normalized.startsWith('zh')) return 'zh-CN'

  return 'pt-BR' // default
}

/**
 * Substitui placeholders {{key}} com valores fornecidos.
 * @param template - Template com placeholders (ex: "Olá, {{name}}!")
 * @param vars - Objeto com os valores para substituição
 * @returns String com placeholders substituídos
 */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? `{{${key}}}`))
}

/** Singleton do i18n */
let currentLocale: SupportedLocale | null = null

/**
 * Inicializa o i18n com um locale específico ou detecta automaticamente.
 * @param locale - Locale a usar (auto-detecta se não informado)
 */
export function initI18n(locale?: SupportedLocale): void {
  currentLocale = locale ?? detectLocale()
}

/**
 * Retorna o locale atualmente ativo.
 */
export function getLocale(): SupportedLocale {
  return currentLocale ?? detectLocale()
}

type DeepRecord = Record<string, string | DeepRecord>

/**
 * Navega em um objeto aninhado usando dot-notation.
 * @param obj - Objeto de mensagens
 * @param key - Chave em dot-notation (ex: 'cli.chat.start')
 * @returns A string encontrada ou undefined
 */
function resolve(obj: DeepRecord, key: string): string | undefined {
  const parts = key.split('.')
  let current: string | DeepRecord = obj
  for (const part of parts) {
    if (typeof current !== 'object' || !(part in current)) return undefined
    current = current[part]
  }
  return typeof current === 'string' ? current : undefined
}

/**
 * Traduz uma chave de mensagem para o locale atual.
 * @param key - Chave em dot-notation (ex: 'cli.chat.start')
 * @param vars - Variáveis para interpolação (ex: { version: '1.0.0' })
 * @returns String traduzida, ou a chave se não encontrada
 * @example
 * t('cli.chat.error', { message: 'timeout' })
 * // → "Erro no chat: timeout" (em pt-BR)
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const locale = getLocale()
  const messages = LOCALES[locale] as unknown as DeepRecord
  const template = resolve(messages, key) ?? key
  return vars ? interpolate(template, vars) : template
}
