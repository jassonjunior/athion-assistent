/**
 * VSCodeDecorator
 * Descrição: Decorator para stories do VSCode — injeta CSS vars --vscode-* fake e container estilizado.
 */

import type { Decorator } from '@storybook/react-vite'

/** CSS vars fake que simulam o ambiente VSCode Dark */
const vscodeThemeVars: React.CSSProperties = {
  // @ts-expect-error CSS custom properties
  '--vscode-editor-background': '#1e1e1e',
  '--vscode-editor-foreground': '#cccccc',
  '--vscode-sideBar-background': '#252526',
  '--vscode-editorWidget-background': '#2d2d30',
  '--vscode-focusBorder': '#007acc',
  '--vscode-descriptionForeground': '#858585',
  '--vscode-input-background': '#3c3c3c',
  '--vscode-input-foreground': '#cccccc',
  '--vscode-input-border': '#3c3c3c',
  '--vscode-button-background': '#0e639c',
  '--vscode-button-foreground': '#ffffff',
  '--vscode-button-hoverBackground': '#1177bb',
  '--vscode-testing-iconPassed': '#4ec9b0',
  '--vscode-testing-iconFailed': '#f14c4c',
  '--vscode-editorWarning-foreground': '#cca700',
  '--vscode-list-hoverBackground': '#2a2d2e',
  '--vscode-list-activeSelectionBackground': '#094771',
  '--vscode-list-activeSelectionForeground': '#ffffff',
}

export const VSCodeDecorator: Decorator = (Story) => (
  <div
    className="theme-vscode vscode-dark"
    style={{
      ...vscodeThemeVars,
      backgroundColor: 'var(--vscode-editor-background)',
      color: 'var(--vscode-editor-foreground)',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: '13px',
      padding: '8px',
      maxWidth: '400px',
    }}
  >
    <Story />
  </div>
)
