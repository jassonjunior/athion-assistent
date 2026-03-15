import type { Meta, StoryObj } from '@storybook/react-vite'
import { VSCodeDecorator } from '@athion/storybook/decorators'
import { ToolCallCard } from './ToolCallCard'

const meta = {
  title: 'VSCode/Chat/ToolCallCard',
  component: ToolCallCard,
  decorators: [VSCodeDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ToolCallCard>

export default meta
type Story = StoryObj<typeof meta>

export const Running: Story = {
  args: {
    toolCall: {
      id: 'tc-1',
      name: 'read_file',
      args: { path: 'src/index.ts' },
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
      result:
        'import { createServer } from "node:http"\n\nconst server = createServer((req, res) => {\n  res.end("Hello")\n})\n\nserver.listen(3000)',
    },
  },
}

export const Error: Story = {
  args: {
    toolCall: {
      id: 'tc-3',
      name: 'execute_command',
      args: { command: 'npm test' },
      status: 'error',
      result: 'ENOENT: no such file or directory, open "test.config.ts"',
    },
  },
}

export const LongResult: Story = {
  args: {
    toolCall: {
      id: 'tc-4',
      name: 'search_codebase',
      args: { query: 'authentication' },
      status: 'success',
      result: Array(20)
        .fill('src/auth/middleware.ts:15 - export function authenticate(req, res, next) { ... }')
        .join('\n'),
    },
  },
}
