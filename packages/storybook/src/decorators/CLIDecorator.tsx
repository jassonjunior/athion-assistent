/**
 * CLIDecorator
 * Descrição: Decorator para stories do CLI — container estilizado como terminal.
 */

import type { Decorator } from '@storybook/react-vite'

export const CLIDecorator: Decorator = (Story) => (
  <div
    className="theme-cli terminal-container"
    style={{
      backgroundColor: '#1a1b26',
      color: '#c0caf5',
      fontFamily: "'SF Mono', 'Cascadia Code', 'Fira Code', monospace",
      padding: '12px',
      borderRadius: '8px',
      fontSize: '13px',
      lineHeight: '1.5',
      minHeight: '384px',
      width: '640px',
    }}
  >
    <Story />
  </div>
)
