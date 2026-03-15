/**
 * SubAgentDisplay Stories
 * Representação visual HTML do componente Ink SubAgentDisplay para preview no Storybook.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CLIDecorator } from '@athion/storybook/decorators'

function SubAgentPreview({
  name,
  status,
  continuations,
}: {
  name: string
  status: 'running' | 'completed' | 'failed'
  continuations: number
}) {
  const statusMap = {
    running: { icon: '⠋', color: '#e0af68', label: 'running' },
    completed: { icon: '✓', color: '#9ece6a', label: 'done' },
    failed: { icon: '✗', color: '#f7768e', label: 'failed' },
  }
  const { icon, color, label } = statusMap[status]

  return (
    <div style={{ paddingLeft: 8 }}>
      <span style={{ color }}>{icon}</span> <span style={{ color: '#bb9af7' }}>⚡ {name}</span>
      {continuations > 0 && (
        <span style={{ color: '#565f89' }}> ({continuations} continuations)</span>
      )}
      <span style={{ color: '#565f89' }}> [{label}]</span>
    </div>
  )
}

const meta = {
  title: 'CLI/Feedback/SubAgentDisplay',
  component: SubAgentPreview,
  decorators: [CLIDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof SubAgentPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Running: Story = {
  args: { name: 'code-reviewer', status: 'running', continuations: 0 },
}

export const RunningWithContinuations: Story = {
  args: { name: 'solution-architect', status: 'running', continuations: 3 },
}

export const Completed: Story = {
  args: { name: 'code-reviewer', status: 'completed', continuations: 2 },
}

export const Failed: Story = {
  args: { name: 'test-runner', status: 'failed', continuations: 1 },
}
