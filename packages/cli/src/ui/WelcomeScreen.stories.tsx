/**
 * WelcomeScreen Stories
 * Representação visual HTML do componente Ink WelcomeScreen para preview no Storybook.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CLIDecorator } from '@athion/storybook/decorators'

function WelcomePreview({
  model,
  indexing,
}: {
  model: string
  indexing?: { phase: string; progress: number } | null
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        paddingTop: 24,
      }}
    >
      <div style={{ color: '#7aa2f7', fontWeight: 'bold', fontSize: 16 }}>
        {'  ◆  Athion Assistent  ◆'}
      </div>
      <div style={{ color: '#565f89' }}>modelo: {model}</div>
      <div style={{ marginTop: 12, color: '#565f89' }}>
        <div>
          <span style={{ color: '#9ece6a' }}>/codebase index</span> — indexar o projeto
        </div>
        <div>
          <span style={{ color: '#9ece6a' }}>/codebase &lt;query&gt;</span> — buscar no código
        </div>
        <div>
          <span style={{ color: '#9ece6a' }}>@arquivo</span> — referenciar arquivo
        </div>
      </div>
      <div style={{ marginTop: 8, color: '#565f89', fontSize: 11 }}>
        <span>Ctrl+L</span> limpar · <span>Ctrl+C</span> sair · <span>Enter</span> enviar
      </div>
      {indexing && (
        <div style={{ marginTop: 8, color: '#bb9af7' }}>
          {indexing.phase}: {Math.round(indexing.progress * 100)}%
        </div>
      )}
    </div>
  )
}

const meta = {
  title: 'CLI/Display/WelcomeScreen',
  component: WelcomePreview,
  decorators: [CLIDecorator],
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
} satisfies Meta<typeof WelcomePreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: { model: 'claude-sonnet-4-20250514' },
}

export const WithIndexing: Story = {
  args: {
    model: 'claude-sonnet-4-20250514',
    indexing: { phase: 'Indexing', progress: 0.45 },
  },
}

export const OpusModel: Story = {
  args: { model: 'claude-opus-4-20250514' },
}
