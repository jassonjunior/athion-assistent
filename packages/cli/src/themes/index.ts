/**
 * Registry de temas do CLI.
 * Carrega o tema configurado em `config.theme`.
 */

import type { Theme } from '../types.js'
import { defaultTheme, darkTheme, lightTheme, minimalTheme, draculaTheme } from './themes.js'

const themes: Record<string, Theme> = {
  default: defaultTheme,
  dark: darkTheme,
  light: lightTheme,
  minimal: minimalTheme,
  dracula: draculaTheme,
}

export function getTheme(name: string): Theme {
  return themes[name] ?? defaultTheme
}

export function listThemes(): string[] {
  return Object.keys(themes)
}
