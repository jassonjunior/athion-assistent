/**
 * ObservabilityDecorator
 * Descrição: Decorator para stories do Observability — aplica tema Catppuccin.
 */

import type { Decorator } from '@storybook/react-vite'

export const ObservabilityDecorator: Decorator = (Story) => (
  <div
    className="theme-observability"
    style={{
      backgroundColor: '#1e1e2e',
      color: '#cdd6f4',
      fontFamily: 'inherit',
      padding: '16px',
      minHeight: '400px',
    }}
  >
    <Story />
  </div>
)
