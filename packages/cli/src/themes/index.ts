/**
 * Registry de temas do CLI.
 * Descrição: Carrega e gerencia os temas visuais configuráveis do CLI.
 */

import type { Theme } from '../types.js'
import { defaultTheme, darkTheme, lightTheme, minimalTheme, draculaTheme } from './themes.js'

/** themes
 * Descrição: Mapa de temas disponíveis indexados por nome.
 */
const themes: Record<string, Theme> = {
  default: defaultTheme,
  dark: darkTheme,
  light: lightTheme,
  minimal: minimalTheme,
  dracula: draculaTheme,
}

/** getTheme
 * Descrição: Retorna o tema correspondente ao nome informado, ou o tema padrão se não encontrado.
 * @param name - Nome do tema a ser carregado
 * @returns Objeto Theme com as cores do tema solicitado
 */
export function getTheme(name: string): Theme {
  return themes[name] ?? defaultTheme
}

/** listThemes
 * Descrição: Lista os nomes de todos os temas disponíveis no registry.
 * @returns Array com os nomes dos temas registrados
 */
export function listThemes(): string[] {
  return Object.keys(themes)
}
