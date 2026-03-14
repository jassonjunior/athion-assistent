import type { Meta, StoryObj } from '@storybook/react-vite'
import { ToolCallCard } from './ToolCallCard'

const meta: Meta<typeof ToolCallCard> = {
  title: 'Desktop/ToolCallCard',
  component: ToolCallCard,
}
export default meta

type Story = StoryObj<typeof ToolCallCard>

export const Running: Story = {
  args: {
    toolCall: {
      id: 'tc-1',
      name: 'search_files',
      args: { query: 'useEffect' },
      status: 'running',
    },
  },
}

export const Success: Story = {
  args: {
    toolCall: {
      id: 'tc-2',
      name: 'read_file',
      args: { path: 'src/index.ts' },
      status: 'success',
      result: 'import { createApp } from "./app"\n\ncreateApp().listen(3000)',
    },
  },
}

export const ErrorStatus: Story = {
  args: {
    toolCall: {
      id: 'tc-3',
      name: 'write_file',
      args: { path: '/etc/passwd' },
      status: 'error',
      result: 'Permission denied: /etc/passwd',
    },
  },
}
