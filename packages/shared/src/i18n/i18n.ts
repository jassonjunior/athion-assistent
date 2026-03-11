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

/** Resolve o locale do sistema operacional (Node.js ou Browser) */
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

/**
 * Substitui placeholders {{key}} com valores fornecidos.
 */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(vars[key] ?? `{{${key}}}`))
}

/** Singleton do i18n */
let currentLocale: SupportedLocale | null = null

/**
 * Inicializa o i18n com um locale específico ou detecta automaticamente.
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

/**
 * Define o locale diretamente (alias de initI18n para clareza).
 */
export function setLocale(locale: SupportedLocale | string): void {
  initI18n(locale)
}

/**
 * Retorna o locale atualmente ativo.
 */
export function getLocale(): SupportedLocale {
  return currentLocale ?? detectLocale()
}

type DeepRecordValue = string | string[] | { [key: string]: DeepRecordValue }
type DeepRecord = { [key: string]: DeepRecordValue }

/**
 * Navega em um objeto aninhado usando dot-notation.
 */
function resolve(obj: DeepRecord, key: string): DeepRecordValue | undefined {
  const parts = key.split('.')
  let current: DeepRecordValue = obj
  for (const part of parts) {
    if (typeof current !== 'object' || Array.isArray(current) || !(part in current))
      return undefined
    const next = (current as DeepRecord)[part]
    if (next === undefined) return undefined
    current = next
  }
  return current
}

/**
 * Traduz uma chave de mensagem para o locale atual.
 * @example t('cli.chat.start')  →  "Iniciando chat..."
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const locale = getLocale()
  const messages = LOCALES[locale] as unknown as DeepRecord
  const value = resolve(messages, key)
  const template = typeof value === 'string' ? value : key
  return vars ? interpolate(template, vars) : template
}

/**
 * Traduz uma chave que aponta para um array de strings (ex: frases de loading).
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
