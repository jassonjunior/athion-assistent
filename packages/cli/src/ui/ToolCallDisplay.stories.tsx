/**
 * ToolCallDisplay Stories
 * Representação visual HTML do componente Ink ToolCallDisplay para preview no Storybook.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CLIDecorator } from '@athion/storybook/decorators'

function ToolCallPreview({
  name,
  status,
  args: toolArgs,
  result,
}: {
  name: string
  status: 'pending' | 'running' | 'success' | 'error'
  args?: Record<string, string>
  result?: string
}) {
  const statusIcons: Record<string, { icon: string; color: string }> = {
    pending: { icon: '○', color: '#565f89' },
    running: { icon: '◌', color: '#e0af68' },
    success: { icon: '✓', color: '#9ece6a' },
    error: { icon: '✗', color: '#f7768e' },
  }
  const { icon, color } = statusIcons[status]

  const argsPreview = toolArgs
    ? Object.entries(toolArgs)
        .slice(0, 2)
        .map(([k, v]) => `${k}=${String(v).slice(0, 30)}`)
        .join(' ')
    : ''

  return (
    <div style={{ paddingLeft: 8 }}>
      <span style={{ color }}>{icon}</span> <span style={{ color: '#7aa2f7' }}>{name}</span>
      {argsPreview && <span style={{ color: '#565f89' }}> {argsPreview}</span>}
      {result && (
        <div style={{ color: '#565f89', paddingLeft: 16, fontSize: 12 }}>
          {result.slice(0, 100)}
        </div>
      )}
    </div>
  )
}

const meta = {
  title: 'CLI/Feedback/ToolCallDisplay',
  component: ToolCallPreview,
  decorators: [CLIDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof ToolCallPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Running: Story = {
  args: {
    name: 'read_file',
    status: 'running',
    args: { path: 'src/index.ts' },
  },
}

export const Success: Story = {
  args: {
    name: 'read_file',
    status: 'success',
    args: { path: 'src/index.ts' },
    result: 'import { createServer } from "node:http"\n\nconst server = createServer(...)',
  },
}

export const Error: Story = {
  args: {
    name: 'execute_command',
    status: 'error',
    args: { command: 'npm test' },
    result: 'ENOENT: no such file or directory',
  },
}

export const Pending: Story = {
  args: {
    name: 'search_codebase',
    status: 'pending',
    args: { query: 'authentication middleware' },
  },
}
