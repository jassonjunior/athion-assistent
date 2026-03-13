/**
 * Definições dos 5 temas do CLI.
 * Descrição: Define os esquemas de cores disponíveis para a interface do terminal.
 * Cores são strings hex ou nomes de cor ANSI reconhecidas pelo chalk/Ink.
 */

import type { Theme } from '../types.js'

/** defaultTheme
 * Descrição: Tema padrão com paleta inspirada no Tokyo Night.
 */
export const defaultTheme: Theme = {
  name: 'default',
  primary: '#7aa2f7',
  secondary: '#9ece6a',
  accent: '#bb9af7',
  error: '#f7768e',
  success: '#73daca',
  warning: '#e0af68',
  muted: '#565f89',
}

/** darkTheme
 * Descrição: Tema escuro com paleta inspirada no Catppuccin Mocha.
 */
export const darkTheme: Theme = {
  name: 'dark',
  primary: '#89b4fa',
  secondary: '#a6e3a1',
  accent: '#cba6f7',
  error: '#f38ba8',
  success: '#94e2d5',
  warning: '#f9e2af',
  muted: '#6c7086',
}

/** lightTheme
 * Descrição: Tema claro com paleta inspirada no Catppuccin Latte.
 */
export const lightTheme: Theme = {
  name: 'light',
  primary: '#1e66f5',
  secondary: '#40a02b',
  accent: '#8839ef',
  error: '#d20f39',
  success: '#179299',
  warning: '#df8e1d',
  muted: '#9ca0b0',
}

/** minimalTheme
 * Descrição: Tema minimalista usando apenas cores ANSI básicas.
 */
export const minimalTheme: Theme = {
  name: 'minimal',
  primary: 'white',
  secondary: 'white',
  accent: 'white',
  error: 'red',
  success: 'green',
  warning: 'yellow',
  muted: 'gray',
}

/** draculaTheme
 * Descrição: Tema com paleta inspirada no Dracula.
 */
export const draculaTheme: Theme = {
  name: 'dracula',
  primary: '#8be9fd',
  secondary: '#50fa7b',
  accent: '#bd93f9',
  error: '#ff5555',
  success: '#50fa7b',
  warning: '#f1fa8c',
  muted: '#6272a4',
}
