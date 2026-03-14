import type { Meta, StoryObj } from '@storybook/react-vite'
import { Sidebar } from './Sidebar'
import { fn } from 'storybook/test'

const meta: Meta<typeof Sidebar> = {
  title: 'Desktop/Sidebar',
  component: Sidebar,
  args: {
    onSelectSession: fn(),
    onNewSession: fn(),
    onToggle: fn(),
  },
  decorators: [
    (Story) => (
      <div style={{ height: 500, display: 'flex' }}>
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof Sidebar>

export const Expanded: Story = {
  args: {
    currentSessionId: 'session-1',
    isCollapsed: false,
  },
}

export const Collapsed: Story = {
  args: {
    currentSessionId: 'session-1',
    isCollapsed: true,
  },
}

export const NoSelection: Story = {
  args: {
    currentSessionId: null,
    isCollapsed: false,
  },
}
