import type { Meta, StoryObj } from '@storybook/react-vite'
import { StatusBar } from './StatusBar'

const meta: Meta<typeof StatusBar> = {
  title: 'Desktop/StatusBar',
  component: StatusBar,
}
export default meta

type Story = StoryObj<typeof StatusBar>

export const Ready: Story = {
  args: { status: 'ready' },
}

export const Starting: Story = {
  args: { status: 'starting' },
}

export const Error: Story = {
  args: { status: 'error' },
}

export const Stopped: Story = {
  args: { status: 'stopped' },
}
