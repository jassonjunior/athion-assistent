/**
 * ThemeDecorator
 * Descrição: Decorator que aplica a classe de tema correta baseado no global selecionado no toolbar.
 */

import type { Decorator } from '@storybook/react-vite'

export const ThemeDecorator: Decorator = (Story, context) => {
  const theme = (context.globals['theme'] as string) || 'desktop'

  return (
    <div
      className={`theme-${theme}`}
      style={{
        backgroundColor: 'var(--athion-bg-base)',
        color: 'var(--athion-text-primary)',
        fontFamily: 'var(--athion-font-sans)',
        padding: '16px',
        minHeight: '100vh',
      }}
    >
      <Story />
    </div>
  )
}
