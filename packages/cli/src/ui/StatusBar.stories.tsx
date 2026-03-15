/**
 * StatusBar Stories
 * Representação visual HTML do componente Ink StatusBar para preview no Storybook.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CLIDecorator } from '@athion/storybook/decorators'

function StatusBarPreview({
  model,
  sessionId,
  tokens,
  activeSkill,
  indexing,
}: {
  model: string
  sessionId: string
  tokens: { promptTokens: number; completionTokens: number; totalTokens: number } | null
  activeSkill?: string
  indexing?: { phase: string; progress: number } | null
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        borderBottom: '1px solid #565f89',
        paddingBottom: 4,
      }}
    >
      <span>
        <span style={{ color: '#7aa2f7' }}>◆ Athion</span>
        <span style={{ color: '#565f89' }}> · </span>
        <span style={{ color: '#9ece6a' }}>{model}</span>
        {activeSkill && (
          <>
            <span style={{ color: '#565f89' }}> · </span>
            <span style={{ color: '#e0af68' }}>● {activeSkill}</span>
          </>
        )}
        {indexing && (
          <>
            <span style={{ color: '#565f89' }}> · </span>
            <span style={{ color: '#bb9af7' }}>
              {indexing.phase} {Math.round(indexing.progress * 100)}%
            </span>
          </>
        )}
      </span>
      <span>
        {tokens && (
          <span style={{ color: '#565f89' }}>{tokens.totalTokens.toLocaleString()} tokens</span>
        )}
        <span style={{ color: '#565f89' }}> {sessionId.slice(0, 8)}</span>
      </span>
    </div>
  )
}

const meta = {
  title: 'CLI/Feedback/StatusBar',
  component: StatusBarPreview,
  decorators: [CLIDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof StatusBarPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    model: 'claude-sonnet-4-20250514',
    sessionId: 'abc123def456',
    tokens: { promptTokens: 1200, completionTokens: 800, totalTokens: 2000 },
  },
}

export const WithActiveSkill: Story = {
  args: {
    model: 'claude-sonnet-4-20250514',
    sessionId: 'abc123def456',
    tokens: { promptTokens: 3400, completionTokens: 1200, totalTokens: 4600 },
    activeSkill: 'commit',
  },
}

export const WithIndexing: Story = {
  args: {
    model: 'claude-sonnet-4-20250514',
    sessionId: 'abc123def456',
    tokens: null,
    indexing: { phase: 'Indexing', progress: 0.65 },
  },
}

export const FullStatus: Story = {
  args: {
    model: 'claude-opus-4-20250514',
    sessionId: 'xyz789abc012',
    tokens: { promptTokens: 12000, completionTokens: 5400, totalTokens: 17400 },
    activeSkill: 'solution-architect',
    indexing: { phase: 'Embeddings', progress: 0.92 },
  },
}
