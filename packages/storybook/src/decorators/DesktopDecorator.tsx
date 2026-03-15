/**
 * DesktopDecorator
 * Descrição: Decorator para stories do Desktop — aplica Tailwind context e tema desktop.
 */

import type { Decorator } from '@storybook/react-vite'

export const DesktopDecorator: Decorator = (Story) => (
  <div
    className="theme-desktop bg-surface-950 text-neutral-200 font-sans"
    style={{ padding: '16px' }}
  >
    <Story />
  </div>
)
