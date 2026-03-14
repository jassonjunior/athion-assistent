import type { Meta, StoryObj } from '@storybook/react-vite'
import { ErrorBoundary } from './ErrorBoundary'

const meta: Meta<typeof ErrorBoundary> = {
  title: 'Observability/ErrorBoundary',
  component: ErrorBoundary,
}
export default meta

type Story = StoryObj<typeof ErrorBoundary>

export const Normal: Story = {
  args: {
    children: <div style={{ padding: 20, color: '#e5e7eb' }}>Conteúdo renderizado normalmente</div>,
  },
}

export const CustomFallback: Story = {
  args: {
    fallbackMessage: 'Algo deu errado neste painel',
    children: <div style={{ padding: 20, color: '#e5e7eb' }}>Conteúdo OK</div>,
  },
}
